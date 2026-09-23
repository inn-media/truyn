#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REL = 'scripts/d200-stage-isolated-campaign.sh'
path = ROOT / REL
s = path.read_text(encoding='utf-8')


def once(old, new, label):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    s = s.replace(old, new, 1)

once(
    ': "${EVIDENCE:?source class-d-azure-1000-provision.sh first}"\n\n',
    ': "${EVIDENCE:?source class-d-azure-1000-provision.sh first}"\n\n# Every canonical campaign stage is bounded by the shared evidence-derived\n# Class-D liveness contract. The provisioner normally sources this first; keep\n# this file independently fail-closed as well.\nif ! declare -F class_d_wait_pid_barrier >/dev/null 2>&1; then\n  source "${GITHUB_WORKSPACE:-$PWD}/scripts/class-d-phase-watchdog.sh"\nfi\n\n',
    'watchdog-source',
)

anchor = '''d200_packet_partition_fail_cleanup() {
'''
helper = '''d200_deadline_phase() {
  case "$1" in
    topology) printf '%s\\n' topology ;;
    readiness-barrier) printf '%s\\n' readiness ;;
    convergence) printf '%s\\n' convergence ;;
    baseline-routing) printf '%s\\n' baseline ;;
    invalid-signed-state|local-safety|durable-writes) printf '%s\\n' safety ;;
    restart-recovery) printf '%s\\n' restart ;;
    post-restart-routing) printf '%s\\n' postRestart ;;
    packet-partition) printf '%s\\n' adversarial ;;
    healed-routing) printf '%s\\n' healedRouting ;;
    write-retention) printf '%s\\n' retention ;;
    resources|evidence) printf '%s\\n' resources ;;
    *) echo "TRUYN_CLASS_D_PHASE unmapped stage=$1" >&2; return 2 ;;
  esac
}

d200_packet_partition_fail_cleanup() {
'''
once(anchor, helper, 'deadline-map')

old = '''  set +e
  (
    trap - ERR EXIT
    d200_stage_failure_file="$failure_file"
    d200_stage_state_file="$state_file"
    trap 'rc=$?; cmd_b64=$(printf "%s" "$BASH_COMMAND" | base64 -w0); printf "rc=%s\\nline=%s\\ncommand_b64=%s\\n" "$rc" "$LINENO" "$cmd_b64" >"$d200_stage_failure_file"; exit "$rc"' ERR
    trap 'rc=$?; trap - EXIT; d200_stage_dump_state "$d200_stage_state_file"; exit "$rc"' EXIT
    set -Eeuo pipefail
    source "$stage_file"
  )
  rc=$?
  set -e

  if [[ -s "$state_file" ]]; then source "$state_file"; fi
'''
new = '''  local deadline_phase stage_pid recovery_deadline recovery_observed
  deadline_phase="$(d200_deadline_phase "$stage")"
  (
    trap - ERR EXIT
    d200_stage_failure_file="$failure_file"
    d200_stage_state_file="$state_file"
    trap 'rc=$?; cmd_b64=$(printf "%s" "$BASH_COMMAND" | base64 -w0); printf "rc=%s\\nline=%s\\ncommand_b64=%s\\n" "$rc" "$LINENO" "$cmd_b64" >"$d200_stage_failure_file"; exit "$rc"' ERR
    trap 'rc=$?; trap - EXIT; d200_stage_dump_state "$d200_stage_state_file"; exit "$rc"' EXIT
    set -Eeuo pipefail
    source "$stage_file"
  ) &
  stage_pid=$!
  if class_d_wait_pid_barrier "$deadline_phase" "$stage_pid"; then
    rc=0
  else
    rc=$?
  fi

  if [[ -s "$state_file" ]]; then source "$state_file"; fi

  # Restart has two liveness contracts: the whole restart stage and the measured
  # recovery window. The recovery p95 stays stricter than the historical+margin
  # budget and still remains subject to the unchanged <=120s acceptance gate.
  if [[ "$stage" == restart-recovery && "$rc" == 0 ]]; then
    recovery_deadline="$(class_d_deadline_ms recovery)"
    recovery_observed="${recovery_p95:-}"
    if [[ "$recovery_observed" =~ ^[0-9]+([.][0-9]+)?$ ]] && python3 - "$recovery_observed" "$recovery_deadline" <<'PYRECOVERY'
import sys
raise SystemExit(0 if float(sys.argv[1]) <= float(sys.argv[2]) else 1)
PYRECOVERY
    then
      class_d_phase_event recovery PASS "$recovery_deadline" "${recovery_observed%.*}" 0 "recoveryP95Ms=${recovery_observed}"
    else
      class_d_phase_event recovery TIMEOUT "$recovery_deadline" "${recovery_observed%.*}" 124 "recovery p95 exceeded historical liveness budget"
      rc=124
    fi
  fi
'''
once(old, new, 'stage-deadline-runner')

path.write_text(s, encoding='utf-8')
print('TRUYN_CLASS_D_STAGE_DEADLINES=APPLIED')
