#!/usr/bin/env bash
# D-200 stage-isolated orchestration.
# This file is sourced after class-d-azure-1000-provision.sh so that Azure
# resources, remote(), marker(), cleanup and evidence helpers already exist.
# A RED stage never weakens acceptance: it is recorded and later stages are
# attempted when meaningful, then the whole campaign returns non-zero.

: "${HOST_COUNT:?source class-d-azure-1000-provision.sh first}"
: "${NODES_PER_HOST:?source class-d-azure-1000-provision.sh first}"
: "${NODE_COUNT:?source class-d-azure-1000-provision.sh first}"
: "${EVIDENCE:?source class-d-azure-1000-provision.sh first}"

D200_CAMPAIGN_SOURCE="${D200_CAMPAIGN_SOURCE:-benchmarks/scale/class-d-azure-1000-campaign.sh}"
D200_RESTART_STAGE_SOURCE="${D200_RESTART_STAGE_SOURCE:-benchmarks/scale/d200-restart-recovery-stage.sh}"
D200_STAGE_RESULTS_JSON="${GITHUB_WORKSPACE:-$PWD}/class-d-200-stage-results.json"
D200_STAGE_RESULTS_JSONL="${GITHUB_WORKSPACE:-$PWD}/class-d-200-stage-results.jsonl"
D200_STAGE_TMP="$(mktemp -d)"
: >"$D200_STAGE_RESULTS_JSONL"

# Do not let the provisioner's global ERR trap terminate the whole campaign
# while one isolated stage is being observed. It is restored before returning.
trap - ERR

declare -A D200_STAGE_STATUS=()
d200_overall_failed=0
d200_first_failure_stage=''
d200_first_failure_rc=0
d200_first_failure_line=0

# Scalars needed by later stages and by the canonical evidence writer. A stage
# subshell dumps every variable it managed to compute, even when that stage is
# RED, so later independent stages can still run and partial evidence survives.
D200_STATE_VARS=(
  readiness_ready readiness_total readiness_min_valid readiness_max_valid readiness_min_buckets readiness_max_buckets readiness_min_hosts readiness_max_hosts readiness_ms
  conv_success conv_total conv_p95 conv_p99 conv_rate conv_ms
  base_success base_total base_p50 base_p90 base_p95 base_p99 base_rate
  dht_safety_acks invalid_remote_quic invalid_target_rejected invalid_rejection_reason invalid_signed_state_accepted
  stale_receipt_accepted stale_receipt_reason unauthorized_provider_execution provider_access_denied
  writes d200_durable_write_ttl_ms d200_write_window_start_ms d200_write_window_last_ack_ms
  stop_p95 start_p95 ready_p95 recovery_p95 restart_hosts_pass restart_hosts_total
  post_success post_total post_rate
  partition_successes partition_probes heal_code partition_recovery_ms
  healed_success healed_total healed_p50 healed_p90 healed_p95 healed_p99 healed_rate
  d200_retention_required_margin_ms d200_retention_start_ms d200_retention_age_start_ms d200_retention_end_ms d200_retention_age_end_ms retained ack_loss
  rss_kb quic_bytes process_total END_MS
)

d200_stage_dump_state() {
  local destination="$1" name
  : >"$destination"
  for name in "${D200_STATE_VARS[@]}"; do
    # Use plain shell assignments rather than `declare -p`: sourcing a declare
    # inside d200_run_stage() would make the restored value local to that
    # function and lose it before the next stage/evidence writer can consume it.
    if [[ -v "$name" ]]; then printf '%s=%q\n' "$name" "${!name}" >>"$destination"; fi
  done
}

d200_append_stage_result() {
  local stage="$1" status="$2" rc="$3" line="$4" command_b64="$5" reason="${6:-}"
  python3 - "$D200_STAGE_RESULTS_JSONL" "$stage" "$status" "$rc" "$line" "$command_b64" "$reason" <<'PYD200STAGE'
import base64, json, sys
path, stage, status, rc, line, command_b64, reason = sys.argv[1:]
try: command = base64.b64decode(command_b64).decode('utf-8', 'replace') if command_b64 else None
except Exception: command = None
value = {
    'stage': stage,
    'status': status,
    'rc': int(rc),
    'line': int(line),
    'command': command,
    'reason': reason or None,
}
with open(path, 'a', encoding='utf-8') as handle:
    handle.write(json.dumps(value, separators=(',', ':')) + '\n')
PYD200STAGE
}

d200_split_campaign() {
  python3 - "$D200_CAMPAIGN_SOURCE" "$D200_STAGE_TMP" <<'PYD200SPLIT'
from pathlib import Path
import re, sys
source = Path(sys.argv[1]).read_text(encoding='utf-8')
out = Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
stages=[]; current=None; lines=[]
def flush():
    if current is None: return
    path=out / f'{len(stages):02d}-{current}.sh'
    path.write_text(''.join(lines), encoding='utf-8')
    stages.append((current, str(path)))
for line in source.splitlines(keepends=True):
    match=re.fullmatch(r'STAGE=([A-Za-z0-9_-]+)\n?', line)
    if match:
        flush(); current=match.group(1); lines=[line]
    elif current is not None:
        lines.append(line)
flush()
if not stages: raise SystemExit('TRUYN_D200_STAGE_SPLIT_EMPTY')
for stage,path in stages: print(stage+'\t'+path)
PYD200SPLIT
}

d200_packet_partition_fail_cleanup() {
  # A failed packet-partition stage must not poison later diagnostics by leaving
  # its iptables rule installed. This is best-effort diagnostic cleanup only;
  # Azure resource cleanup remains owned by the provisioner EXIT trap.
  [[ ${#VMS[@]} -ge 1 && ${#PRIV[@]} -ge 2 ]] || return 0
  local block_ip="${PRIV[1]}"
  set +e
  remote "${VMS[0]}" "set +e; while iptables -C OUTPUT -p udp -d '${block_ip}' --dport ${QUIC_BASE}:$((QUIC_BASE+NODES_PER_HOST-1)) -m comment --comment truyn-d1000-partition -j DROP >/dev/null 2>&1; do iptables -D OUTPUT -p udp -d '${block_ip}' --dport ${QUIC_BASE}:$((QUIC_BASE+NODES_PER_HOST-1)) -m comment --comment truyn-d1000-partition -j DROP; done; exit 0" >/dev/null 2>&1
  set -e
}

d200_run_stage() {
  local stage="$1" stage_file="$2" state_file="$D200_STAGE_TMP/state-${stage}.sh" failure_file="$D200_STAGE_TMP/failure-${stage}.txt"
  local rc failure_rc failure_line command_b64
  rm -f "$state_file" "$failure_file"

  set +e
  (
    trap - ERR EXIT
    d200_stage_failure_file="$failure_file"
    d200_stage_state_file="$state_file"
    trap 'rc=$?; cmd_b64=$(printf "%s" "$BASH_COMMAND" | base64 -w0); printf "rc=%s\nline=%s\ncommand_b64=%s\n" "$rc" "$LINENO" "$cmd_b64" >"$d200_stage_failure_file"; exit "$rc"' ERR
    trap 'rc=$?; trap - EXIT; d200_stage_dump_state "$d200_stage_state_file"; exit "$rc"' EXIT
    set -Eeuo pipefail
    source "$stage_file"
  )
  rc=$?
  set -e

  if [[ -s "$state_file" ]]; then source "$state_file"; fi
  failure_rc="$rc"; failure_line=0; command_b64=''
  if [[ -s "$failure_file" ]]; then
    failure_rc="$(sed -n 's/^rc=//p' "$failure_file" | tail -1)"
    failure_line="$(sed -n 's/^line=//p' "$failure_file" | tail -1)"
    command_b64="$(sed -n 's/^command_b64=//p' "$failure_file" | tail -1)"
  fi

  if [[ "$rc" == 0 ]]; then
    D200_STAGE_STATUS["$stage"]=PASS
    d200_append_stage_result "$stage" PASS 0 0 '' ''
    echo "TRUYN_D200_STAGE_RESULT stage=${stage} status=PASS rc=0"
  else
    D200_STAGE_STATUS["$stage"]=RED
    d200_append_stage_result "$stage" RED "${failure_rc:-$rc}" "${failure_line:-0}" "$command_b64" 'stage returned non-zero'
    echo "TRUYN_D200_STAGE_RESULT stage=${stage} status=RED rc=${failure_rc:-$rc} line=${failure_line:-0}" >&2
    d200_overall_failed=1
    if [[ -z "$d200_first_failure_stage" ]]; then
      d200_first_failure_stage="$stage"
      d200_first_failure_rc="${failure_rc:-$rc}"
      d200_first_failure_line="${failure_line:-0}"
    fi
    if [[ "$stage" == packet-partition ]]; then d200_packet_partition_fail_cleanup || true; fi
  fi
}

d200_skip_stage() {
  local stage="$1" reason="$2"
  D200_STAGE_STATUS["$stage"]=SKIPPED_DEPENDENCY
  d200_append_stage_result "$stage" SKIPPED_DEPENDENCY 1 0 '' "$reason"
  echo "TRUYN_D200_STAGE_RESULT stage=${stage} status=SKIPPED_DEPENDENCY reason=${reason}" >&2
  d200_overall_failed=1
  if [[ -z "$d200_first_failure_stage" ]]; then
    d200_first_failure_stage="$stage"; d200_first_failure_rc=1; d200_first_failure_line=0
  fi
}

stage_plan="$D200_STAGE_TMP/stages.tsv"
set +e
d200_split_campaign >"$stage_plan"
stage_split_rc=$?
set -e
if [[ "$stage_split_rc" != 0 || ! -s "$stage_plan" ]]; then
  d200_overall_failed=1
  d200_first_failure_stage=stage-plan
  d200_first_failure_rc="${stage_split_rc:-1}"
  d200_first_failure_line=0
  d200_append_stage_result stage-plan RED "${stage_split_rc:-1}" 0 '' 'canonical campaign stage split failed'
  echo "TRUYN_D200_STAGE_RESULT stage=stage-plan status=RED rc=${stage_split_rc:-1}" >&2
else
  mapfile -t D200_STAGE_ROWS <"$stage_plan"
  required_stage_missing=0
  for required_stage in restart-recovery post-restart-routing packet-partition healed-routing resources evidence; do
    if ! printf '%s\n' "${D200_STAGE_ROWS[@]}" | cut -f1 | grep -Fxq "$required_stage"; then
      required_stage_missing=1
      d200_append_stage_result stage-plan RED 1 0 '' "missing required stage ${required_stage}"
      echo "TRUYN_D200_STAGE_PLAN_MISSING stage=${required_stage}" >&2
    fi
  done
  if [[ "$required_stage_missing" != 0 ]]; then
    d200_overall_failed=1
    d200_first_failure_stage=stage-plan
    d200_first_failure_rc=1
    d200_first_failure_line=0
  else
    for row in "${D200_STAGE_ROWS[@]}"; do
      stage="${row%%$'\t'*}"
      stage_file="${row#*$'\t'}"

      # The restart override is semantically identical acceptance-wise but always
      # emits per-host diagnostics before returning RED. Other stages remain the
      # canonical campaign source split at STAGE= boundaries.
      if [[ "$stage" == restart-recovery && -f "$D200_RESTART_STAGE_SOURCE" ]]; then
        stage_file="$D200_RESTART_STAGE_SOURCE"
      fi

      # Write-retention is meaningful only when the durable-write stage completed
      # successfully; otherwise the expected key set/window is undefined.
      if [[ "$stage" == write-retention && "${D200_STAGE_STATUS[durable-writes]:-RED}" != PASS ]]; then
        d200_skip_stage "$stage" 'durable-writes did not PASS'
        continue
      fi

      # Canonical final evidence requires every mandatory stage to have passed.
      # On a diagnostic RED we create partial evidence after all possible stages.
      if [[ "$stage" == evidence && "$d200_overall_failed" != 0 ]]; then
        d200_skip_stage "$stage" 'one or more mandatory stages RED/SKIPPED'
        continue
      fi

      d200_run_stage "$stage" "$stage_file"
    done
  fi
fi

python3 - "$D200_STAGE_RESULTS_JSONL" "$D200_STAGE_RESULTS_JSON" "$d200_overall_failed" <<'PYD200RESULTS'
import json, sys
rows=[]
with open(sys.argv[1], encoding='utf-8') as handle:
    for line in handle:
        line=line.strip()
        if line: rows.append(json.loads(line))
value={
  'schema':'truyn.d200.stage-results.v1',
  'overall':'FAIL' if int(sys.argv[3]) else 'PASS',
  'allPossibleStagesAttempted':True,
  'acceptanceWeakened':False,
  'stages':rows,
}
with open(sys.argv[2], 'w', encoding='utf-8') as handle:
    json.dump(value, handle, separators=(',', ':')); handle.write('\n')
PYD200RESULTS

if [[ "$d200_overall_failed" != 0 ]]; then
  # Some canonical stages (notably packet-partition) can write an immediate
  # checkpoint of their own. Keep that immutable checkpoint as a separate
  # diagnostic artifact, then rebuild the final partial evidence from the
  # accumulated parent state so metrics from stages that continued afterward
  # are not lost behind the checkpoint function's RETAINED guard.
  if [[ -s "$EVIDENCE" ]]; then
    cp "$EVIDENCE" "${GITHUB_WORKSPACE:-$PWD}/class-d-200-intermediate-failure-evidence.json"
    rm -f "$EVIDENCE"
  fi
  d200_failure_evidence_checkpoint "${d200_first_failure_rc:-1}" "${d200_first_failure_stage:-unknown}" "${d200_first_failure_line:-0}" || true
fi

if [[ -s "$EVIDENCE" ]]; then
  tmp="${EVIDENCE}.stage-results.tmp"
  jq --slurpfile stageResults "$D200_STAGE_RESULTS_JSON" \
    '.stageResults=$stageResults[0] | if .failure then .failure.diagnosticPassComplete=true else . end' \
    "$EVIDENCE" >"$tmp" && mv "$tmp" "$EVIDENCE"
fi

rm -rf "$D200_STAGE_TMP"
trap 'd200_err_trap "$?" "$STAGE" "$LINENO"' ERR

if [[ "$d200_overall_failed" != 0 ]]; then
  STAGE="${d200_first_failure_stage:-stage-isolated-campaign}"
  if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 1; else exit 1; fi
fi

if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then return 0; else exit 0; fi
