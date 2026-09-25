#!/usr/bin/env python3
from pathlib import Path

PROVISION = Path('benchmarks/scale/class-d-azure-1000-provision.sh')
TIME_TEST = Path('tests/d500-campaign-time-budget.test.js')
HELPER = Path('scripts/class-d-bootstrap-host-resilience.sh')
RESILIENCE_TEST = Path('tests/d500-bootstrap-resilience.test.js')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


provision = PROVISION.read_text()

old_defaults = '''TRUYN_D500_REMOTE_TIMEOUT_S="${TRUYN_D500_REMOTE_TIMEOUT_S:-600}"
TRUYN_D500_REMOTE_ATTEMPTS="${TRUYN_D500_REMOTE_ATTEMPTS:-3}"
TRUYN_D500_DEADLINE_EPOCH="${TRUYN_D500_DEADLINE_EPOCH:-$(( $(date +%s) + TRUYN_D500_BUDGET_S ))}"
export TRUYN_D500_BUDGET_S TRUYN_D500_REMOTE_TIMEOUT_S TRUYN_D500_REMOTE_ATTEMPTS TRUYN_D500_DEADLINE_EPOCH
echo "TRUYN_D500_BUDGET budgetS=${TRUYN_D500_BUDGET_S} deadlineEpoch=${TRUYN_D500_DEADLINE_EPOCH} remoteTimeoutS=${TRUYN_D500_REMOTE_TIMEOUT_S} remoteAttempts=${TRUYN_D500_REMOTE_ATTEMPTS}"
'''
new_defaults = '''TRUYN_D500_REMOTE_TIMEOUT_S="${TRUYN_D500_REMOTE_TIMEOUT_S:-600}"
TRUYN_D500_REMOTE_ATTEMPTS="${TRUYN_D500_REMOTE_ATTEMPTS:-3}"
TRUYN_D500_REMOTE_DRAIN_S="${TRUYN_D500_REMOTE_DRAIN_S:-180}"
TRUYN_D500_REMOTE_BUSY_WAITS="${TRUYN_D500_REMOTE_BUSY_WAITS:-4}"
TRUYN_D500_BOOTSTRAP_REMOTE_TIMEOUT_S="${TRUYN_D500_BOOTSTRAP_REMOTE_TIMEOUT_S:-1500}"
TRUYN_D500_BOOTSTRAP_STAGE_CAP_S="${TRUYN_D500_BOOTSTRAP_STAGE_CAP_S:-1500}"
TRUYN_D500_BOOTSTRAP_NODE_CONCURRENCY="${TRUYN_D500_BOOTSTRAP_NODE_CONCURRENCY:-5}"
TRUYN_D500_DEADLINE_EPOCH="${TRUYN_D500_DEADLINE_EPOCH:-$(( $(date +%s) + TRUYN_D500_BUDGET_S ))}"
export TRUYN_D500_BUDGET_S TRUYN_D500_REMOTE_TIMEOUT_S TRUYN_D500_REMOTE_ATTEMPTS TRUYN_D500_REMOTE_DRAIN_S TRUYN_D500_REMOTE_BUSY_WAITS TRUYN_D500_BOOTSTRAP_REMOTE_TIMEOUT_S TRUYN_D500_BOOTSTRAP_STAGE_CAP_S TRUYN_D500_BOOTSTRAP_NODE_CONCURRENCY TRUYN_D500_DEADLINE_EPOCH
echo "TRUYN_D500_BUDGET budgetS=${TRUYN_D500_BUDGET_S} deadlineEpoch=${TRUYN_D500_DEADLINE_EPOCH} remoteTimeoutS=${TRUYN_D500_REMOTE_TIMEOUT_S} remoteAttempts=${TRUYN_D500_REMOTE_ATTEMPTS} bootstrapRemoteTimeoutS=${TRUYN_D500_BOOTSTRAP_REMOTE_TIMEOUT_S} bootstrapStageCapS=${TRUYN_D500_BOOTSTRAP_STAGE_CAP_S} bootstrapNodeConcurrency=${TRUYN_D500_BOOTSTRAP_NODE_CONCURRENCY}"
'''
provision = replace_once(provision, old_defaults, new_defaults, 'd500 defaults')

remote_start = provision.index('d500_seconds_remaining() {')
remote_end = provision.index('\nmarker() {', remote_start)
old_remote = provision[remote_start:remote_end]
for required in ('TRUYN_D500_REMOTE_TIMEOUT', 'TRUYN_D500_HOST_UNHEALTHY', 'reason=vm_agent_unreachable'):
    if required not in old_remote:
        raise SystemExit(f'remote preimage missing {required}')
new_remote = r'''d500_seconds_remaining() {
  echo $(( TRUYN_D500_DEADLINE_EPOCH - $(date +%s) ))
}

d500_vm_agent_ready() {
  local vm="$1" code
  code=$(timeout 20s az vm get-instance-view -g "$RG" -n "$vm" --query "instanceView.vmAgent.statuses[?code=='ProvisioningState/succeeded'].code | [0]" -o tsv --only-show-errors 2>/dev/null || true)
  [[ "$code" == 'ProvisioningState/succeeded' ]]
}

d500_run_command_extension_state() {
  local vm="$1"
  timeout 20s az vm get-instance-view -g "$RG" -n "$vm" --query "instanceView.extensions[?contains(name, 'RunCommand')].statuses[0].code | [0]" -o tsv --only-show-errors 2>/dev/null || true
}

d500_run_command_busy() {
  grep -Eqi 'Run command extension execution is in progress|run command.*in progress|another operation.*in progress|OperationPreempted' <<<"$1"
}

d500_wait_run_command_drain() {
  local vm="$1" cap="${2:-${TRUYN_D500_REMOTE_DRAIN_S:-180}}" deadline state now
  deadline=$(( $(date +%s) + cap ))
  while true; do
    if ! d500_vm_agent_ready "$vm"; then
      echo "TRUYN_D500_HOST_UNHEALTHY vm=${vm} rc=70 reason=vm_agent_unreachable source=instance_view" >&2
      return 70
    fi
    state=$(d500_run_command_extension_state "$vm")
    case "$state" in
      ''|ProvisioningState/succeeded|ProvisioningState/failed)
        echo "TRUYN_D500_RUN_COMMAND_DRAINED vm=${vm} state=${state:-none}" >&2
        return 0
        ;;
    esac
    now=$(date +%s)
    if [[ "$now" -ge "$deadline" ]]; then
      echo "TRUYN_D500_HOST_SLOW vm=${vm} rc=72 reason=run_command_drain_timeout state=${state}" >&2
      return 72
    fi
    echo "TRUYN_D500_RUN_COMMAND_DRAIN_WAIT vm=${vm} state=${state}" >&2
    sleep 5
  done
}

remote() {
  local vm="$1" body="$2" enc remote_script output rc attempts cap left attempt=1 slow_seen=0 busy_waits=0 drain_rc
  enc="$(printf '%s' "$body" | base64 -w0)"
  remote_script="printf '%s' '$enc' | base64 -d >/tmp/truyn-d1000-run.sh; chmod 700 /tmp/truyn-d1000-run.sh; /bin/bash /tmp/truyn-d1000-run.sh"
  remote_script="${remote_script//truyn/truyn}"
  remote_script="${remote_script//truyn/truyn}"
  attempts="${REMOTE_ATTEMPTS:-${TRUYN_D500_REMOTE_ATTEMPTS:-3}}"
  while [[ "$attempt" -le "$attempts" ]]; do
    cap="${REMOTE_TIMEOUT_S:-${TRUYN_D500_REMOTE_TIMEOUT_S:-600}}"
    if [[ "${TRUYN_D500_DEADLINE_EPOCH:-0}" -gt 0 ]]; then
      left=$(( TRUYN_D500_DEADLINE_EPOCH - $(date +%s) ))
      if [[ "$left" -le 0 ]]; then
        echo "TRUYN_D500_REMOTE_ABORT vm=${vm} reason=campaign_budget_exhausted" >&2
        return 75
      fi
      [[ "$left" -lt "$cap" ]] && cap="$left"
    fi
    if output=$(timeout --signal=TERM --kill-after=30s "$cap" az vm run-command invoke -g "$RG" -n "$vm" --command-id RunShellScript --scripts "$remote_script" --query 'value[0].message' -o tsv --only-show-errors 2>&1); then
      rc=0
    else
      rc=$?
    fi
    printf '%s\n' "$output" >&2
    if [[ $rc -eq 0 ]]; then
      printf '%s\n' "$output"
      return 0
    fi

    # A collision means our preceding invoke is still executing. It is not a
    # new application attempt, so wait for the extension to drain and retry the
    # same attempt number instead of racing it and misclassifying the host.
    if d500_run_command_busy "$output"; then
      busy_waits=$((busy_waits + 1))
      echo "TRUYN_D500_REMOTE_BUSY vm=${vm} attempt=${attempt} busyWait=${busy_waits}" >&2
      if ! d500_vm_agent_ready "$vm"; then
        echo "TRUYN_D500_HOST_UNHEALTHY vm=${vm} rc=70 attempts=${attempt} reason=vm_agent_unreachable source=instance_view" >&2
        return 70
      fi
      if [[ "$busy_waits" -gt "${TRUYN_D500_REMOTE_BUSY_WAITS:-4}" ]]; then
        echo "TRUYN_D500_HOST_SLOW vm=${vm} rc=72 attempts=${attempt} reason=run_command_busy_limit" >&2
        return 72
      fi
      set +e
      d500_wait_run_command_drain "$vm"
      drain_rc=$?
      set -e
      [[ "$drain_rc" -eq 0 ]] || return "$drain_rc"
      continue
    fi

    if [[ $rc -eq 124 || $rc -eq 137 ]]; then
      slow_seen=1
      echo "TRUYN_D500_REMOTE_TIMEOUT vm=${vm} attempt=${attempt} capS=${cap}" >&2
      # Timeout is not proof that the VM agent is dead. Azure instance view is
      # the authority. If Ready, drain the abandoned invoke before any retry.
      if ! d500_vm_agent_ready "$vm"; then
        echo "TRUYN_D500_HOST_UNHEALTHY vm=${vm} rc=70 attempts=${attempt} reason=vm_agent_unreachable source=instance_view" >&2
        return 70
      fi
      set +e
      d500_wait_run_command_drain "$vm"
      drain_rc=$?
      set -e
      [[ "$drain_rc" -eq 0 ]] || return "$drain_rc"
    elif grep -Eqi 'VMAgentStatusCommunicationError|VMExtensionProvisioningTimeout|VMExtensionHandlerNonTransientError|ExtensionFailedToProvision|GuestAgent.*(not ready|unresponsive)' <<<"$output"; then
      echo "TRUYN_D500_VM_AGENT_PATHOLOGY vm=${vm} attempt=${attempt} rc=${rc}" >&2
      if ! d500_vm_agent_ready "$vm"; then
        echo "TRUYN_D500_HOST_UNHEALTHY vm=${vm} rc=70 attempts=${attempt} reason=vm_agent_unreachable source=instance_view" >&2
        return 70
      fi
      slow_seen=1
    fi

    echo "TRUYN_REMOTE_RETRY vm=${vm} attempt=${attempt} rc=${rc}" >&2
    if [[ "$attempt" -ge "$attempts" ]]; then
      if [[ "$slow_seen" == 1 ]]; then
        echo "TRUYN_D500_HOST_SLOW vm=${vm} rc=72 attempts=${attempt} reason=bounded_remote_timeout" >&2
        return 72
      fi
      break
    fi
    attempt=$((attempt + 1))
    sleep $((attempt*3))
  done
  echo "TRUYN_REMOTE_FAILURE vm=${vm} attempts=${attempts} rc=${rc}" >&2
  return "$rc"
}
'''
provision = provision[:remote_start] + new_remote + provision[remote_end:]

old_unit = '''[Unit]
After=network-online.target
[Service]
WorkingDirectory=/opt/truyn/app
EnvironmentFile=/etc/truyn-d1000/node-%i.env
ExecStart=/opt/truyn/runtime/bin/node /opt/truyn/app/network/testnet/node-service.js
Restart=on-failure
RestartSec=1
'''
new_unit = '''[Unit]
After=network-online.target
StartLimitIntervalSec=0
[Service]
WorkingDirectory=/opt/truyn/app
EnvironmentFile=/etc/truyn-d1000/node-%i.env
ExecStart=/opt/truyn/runtime/bin/node /opt/truyn/app/network/testnet/node-service.js
Restart=always
RestartSec=1
'''
provision = replace_once(provision, old_unit, new_unit, 'systemd resilience')

stage_start = provision.index('STAGE=bootstrap\n')
serial_start = provision.index('min_records=999999\n', stage_start)
serial_end = provision.index('EOS\n)\n  script="${script//truyn/truyn}"', serial_start)
serial_preimage = provision[serial_start:serial_end]
for required in ('targetConcurrency:4', 'timeoutMs:240000', '--max-time 300', 'for j in \\$(seq 0 $((NODES_PER_HOST-1)))'):
    if required not in serial_preimage:
        raise SystemExit(f'bootstrap serial preimage missing {required}')
new_guest = r'''TRUYN_D500_BOOTSTRAP_HOST_INDEX=${i} \
TRUYN_D500_BOOTSTRAP_NODES_PER_HOST=${NODES_PER_HOST} \
TRUYN_D500_BOOTSTRAP_CONTROL_BASE=${CONTROL_BASE} \
TRUYN_D500_BOOTSTRAP_MAX_PEERS_PER_NODE=${BOOTSTRAP_MAX_PEERS_PER_NODE} \
TRUYN_D500_BOOTSTRAP_SEED='${GITHUB_SHA}' \
TRUYN_D500_BOOTSTRAP_NODE_CONCURRENCY=${TRUYN_D500_BOOTSTRAP_NODE_CONCURRENCY} \
TRUYN_D500_BOOTSTRAP_STAGE_CAP_S=${TRUYN_D500_BOOTSTRAP_STAGE_CAP_S} \
bash /opt/truyn/app/scripts/class-d-bootstrap-host-resilience.sh
'''
provision = provision[:serial_start] + new_guest + provision[serial_end:]

old_bootstrap_remote = '''    out=$(remote "${VMS[$i]}" "$script") || { rc=$?; echo "TRUYN_D500_BOOTSTRAP_REMOTE_FAILED host=$i rc=$rc"; exit "$rc"; }
    # Keep the host-side evidence even when a marker check below fails: markers,
    # refresh retries and curl errors identify which node stalled.
    printf '%s\\n' "$out" | { grep -E 'BOOTSTRAP_|TRUYN_D200_BOOTSTRAP_REFRESH_RETRY|curl: \\(|[Ee]rror' || true; } | tail -60 | sed "s/^/TRUYN_D500_BOOTSTRAP_HOST_LOG host=$i /"
'''
new_bootstrap_remote = '''    out=$(REMOTE_TIMEOUT_S="${TRUYN_D500_BOOTSTRAP_REMOTE_TIMEOUT_S}" remote "${VMS[$i]}" "$script") || { rc=$?; echo "TRUYN_D500_BOOTSTRAP_REMOTE_FAILED host=$i rc=$rc"; exit "$rc"; }
    # Keep every node-level recovery/failure line before any host-level marker
    # assertion can fail, so a successor failure stays diagnosable.
    printf '%s\\n' "$out" | { grep -E 'BOOTSTRAP_|TRUYN_D200_BOOTSTRAP_REFRESH_RETRY|TRUYN_D500_BOOTSTRAP_NODE_|curl: \\(|[Ee]rror' || true; } | tail -160 | sed "s/^/TRUYN_D500_BOOTSTRAP_HOST_LOG host=$i /"
'''
provision = replace_once(provision, old_bootstrap_remote, new_bootstrap_remote, 'bootstrap remote timeout/evidence')

PROVISION.write_text(provision)

HELPER.write_text(r'''#!/usr/bin/env bash
set -Eeuo pipefail

HOST_INDEX="${TRUYN_D500_BOOTSTRAP_HOST_INDEX:?host index required}"
NODES_PER_HOST="${TRUYN_D500_BOOTSTRAP_NODES_PER_HOST:?nodes per host required}"
CONTROL_BASE="${TRUYN_D500_BOOTSTRAP_CONTROL_BASE:?control base required}"
MAX_PEERS="${TRUYN_D500_BOOTSTRAP_MAX_PEERS_PER_NODE:?max peers required}"
SEED="${TRUYN_D500_BOOTSTRAP_SEED:?bootstrap seed required}"
CONCURRENCY="${TRUYN_D500_BOOTSTRAP_NODE_CONCURRENCY:-5}"
STAGE_CAP_S="${TRUYN_D500_BOOTSTRAP_STAGE_CAP_S:-1500}"
RECOVERY_PROBES="${TRUYN_D500_BOOTSTRAP_RECOVERY_PROBES:-60}"
RECORDS_BY_HOST="${TRUYN_D500_BOOTSTRAP_RECORDS_BY_HOST:-/tmp/records-by-host.json}"
PLAN_BY_NODE="${TRUYN_D500_BOOTSTRAP_PLAN_BY_NODE:-/tmp/bootstrap-plan-by-node.json}"
PLAN_SUMMARY="${TRUYN_D500_BOOTSTRAP_PLAN_SUMMARY:-/tmp/bootstrap-plan-summary.json}"

[[ "$HOST_INDEX" =~ ^[0-9]+$ ]]
[[ "$NODES_PER_HOST" =~ ^[1-9][0-9]*$ ]]
[[ "$CONTROL_BASE" =~ ^[1-9][0-9]*$ ]]
[[ "$MAX_PEERS" =~ ^[1-9][0-9]*$ ]]
[[ "$CONCURRENCY" =~ ^[1-9][0-9]*$ ]]
[[ "$STAGE_CAP_S" =~ ^[1-9][0-9]*$ ]]
[[ "$RECOVERY_PROBES" =~ ^[1-9][0-9]*$ ]]
[[ -s "$RECORDS_BY_HOST" && -s "$PLAN_BY_NODE" && -s "$PLAN_SUMMARY" ]]

stage_deadline_epoch=$(( $(date +%s) + STAGE_CAP_S ))
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

stage_guard() {
  if [[ $(date +%s) -ge "$stage_deadline_epoch" ]]; then
    echo "TRUYN_D500_BOOTSTRAP_STAGE_CAP host=${HOST_INDEX} capS=${STAGE_CAP_S} status=EXHAUSTED" >&2
    return 124
  fi
}

control_url() {
  echo "http://127.0.0.1:$(( CONTROL_BASE + $1 ))"
}

control_ready() {
  local j="$1"
  curl -fsS --max-time 2 "$(control_url "$j")/status" >/dev/null 2>&1
}

diagnose_restart_node() {
  local j="$1" idx unit probe
  idx=$(( HOST_INDEX * NODES_PER_HOST + j ))
  unit="truyn-d1000@${idx}.service"
  echo "TRUYN_D500_BOOTSTRAP_NODE_DIAGNOSTIC host=${HOST_INDEX} node=${j} unit=${unit}" >&2
  systemctl --no-pager --full status "$unit" >&2 || true
  journalctl --no-pager -u "$unit" -n 120 >&2 || true
  (dmesg 2>/dev/null || true) | grep -Ei 'oom|out of memory|killed process' | tail -40 >&2 || true
  systemctl restart "$unit"
  for probe in $(seq 1 "$RECOVERY_PROBES"); do
    stage_guard || return $?
    if control_ready "$j"; then
      echo "TRUYN_D500_BOOTSTRAP_NODE_RECOVERED host=${HOST_INDEX} node=${j} unit=${unit} probe=${probe}" >&2
      return 0
    fi
    sleep 1
  done
  echo "TRUYN_D500_BOOTSTRAP_NODE_RECOVERY_FAILED host=${HOST_INDEX} node=${j} unit=${unit}" >&2
  return 1
}

run_node() {
  local j="$1" node_id payload records unique bytes control refresh_payload refresh_result refresh_rc refresh_reason readiness readiness_rc valid buckets endpoints hosts recovery=0 lifecycle_attempt bootstrap_rc
  node_id=$(jq -r --argjson host "$HOST_INDEX" --argjson node "$j" '.[$host][$node].nodeId' "$RECORDS_BY_HOST")
  payload=$(jq -c --arg node "$node_id" '{records:.[$node]}' "$PLAN_BY_NODE")
  records=$(jq -r --arg node "$node_id" '.[$node] | length' "$PLAN_BY_NODE")
  [[ "$records" -eq "$MAX_PEERS" ]]
  if printf '%s' "$payload" | jq -e --arg node "$node_id" '.records | any(.nodeId == $node)' >/dev/null; then
    echo "TRUYN_D500_BOOTSTRAP_NODE_FAIL host=${HOST_INDEX} node=${j} reason=self_peer" >&2
    return 1
  fi
  unique=$(printf '%s' "$payload" | jq -r '.records[].nodeId' | sort -u | wc -l | tr -d ' ')
  [[ "$unique" -eq "$records" ]]
  bytes=$(printf '%s' "$payload" | wc -c | tr -d ' ')
  [[ "$bytes" -lt 900000 ]]
  control=$(control_url "$j")
  refresh_payload=$(jq -cn --arg seed "${SEED}:bootstrap-refresh:${HOST_INDEX}:${j}" --argjson target "$MAX_PEERS" '{targetCount:$target,maxRounds:4,targetConcurrency:4,timeoutMs:240000,seed:$seed}')

  for lifecycle_attempt in 1 2; do
    stage_guard || { echo "TRUYN_D500_BOOTSTRAP_NODE_FAIL host=${HOST_INDEX} node=${j} reason=stage_cap" >&2; return 124; }
    if ! control_ready "$j"; then
      if [[ "$recovery" == 0 ]] && diagnose_restart_node "$j"; then recovery=1; continue; fi
      echo "TRUYN_D500_BOOTSTRAP_NODE_FAIL host=${HOST_INDEX} node=${j} reason=control_unreachable" >&2
      return 1
    fi

    set +e
    curl -fsS --max-time 90 -H 'content-type: application/json' --data-binary "$payload" "${control}/bootstrap" >/dev/null
    bootstrap_rc=$?
    set -e
    if [[ "$bootstrap_rc" -ne 0 ]]; then
      if ! control_ready "$j" && [[ "$recovery" == 0 ]] && diagnose_restart_node "$j"; then recovery=1; continue; fi
      echo "TRUYN_D500_BOOTSTRAP_NODE_FAIL host=${HOST_INDEX} node=${j} reason=bootstrap_post rc=${bootstrap_rc}" >&2
      return 1
    fi

    refresh_result=''; refresh_rc=1; refresh_reason=none
    for refresh_attempt in 1 2 3; do
      stage_guard || { refresh_rc=124; break; }
      set +e
      refresh_result=$(curl -fsS --max-time 300 -H 'content-type: application/json' --data-binary "$refresh_payload" "${control}/dht/refresh")
      refresh_rc=$?
      set -e
      refresh_reason=none
      if [[ "$refresh_rc" -eq 0 ]]; then
        refresh_reason=$(printf '%s' "$refresh_result" | jq -r '.reason // "none"' 2>/dev/null || echo invalid-json)
        if printf '%s' "$refresh_result" | jq -e '.refreshed == true' >/dev/null 2>&1; then break; fi
        refresh_rc=70
      fi
      echo "TRUYN_D200_BOOTSTRAP_REFRESH_RETRY host=${HOST_INDEX} node=${j} attempt=${refresh_attempt} rc=${refresh_rc} reason=${refresh_reason}" >&2
      [[ "$refresh_attempt" -lt 3 ]] && sleep $((refresh_attempt * 2))
    done
    if [[ "$refresh_rc" -ne 0 ]] || ! printf '%s' "$refresh_result" | jq -e '.refreshed == true' >/dev/null 2>&1; then
      if ! control_ready "$j" && [[ "$recovery" == 0 ]] && diagnose_restart_node "$j"; then recovery=1; continue; fi
      echo "TRUYN_D500_BOOTSTRAP_NODE_FAIL host=${HOST_INDEX} node=${j} reason=refresh rc=${refresh_rc}" >&2
      return 1
    fi

    set +e
    readiness=$(curl -fsS --max-time 20 "${control}/dht/readiness")
    readiness_rc=$?
    set -e
    if [[ "$readiness_rc" -ne 0 ]]; then
      if ! control_ready "$j" && [[ "$recovery" == 0 ]] && diagnose_restart_node "$j"; then recovery=1; continue; fi
      echo "TRUYN_D500_BOOTSTRAP_NODE_FAIL host=${HOST_INDEX} node=${j} reason=readiness rc=${readiness_rc}" >&2
      return 1
    fi
    [[ "$(printf '%s' "$readiness" | jq -r '.refresh.status')" == refreshed ]]
    valid=$(printf '%s' "$readiness" | jq -r '.validPeers')
    buckets=$(printf '%s' "$readiness" | jq -r '.populatedBuckets')
    endpoints=$(printf '%s' "$readiness" | jq -r '.remoteEndpointDiversity.endpointCount')
    hosts=$(printf '%s' "$readiness" | jq -r '.remoteEndpointDiversity.hostCount')
    [[ "$valid" -ge "$records" ]]
    printf '%s %s %s %s %s %s %s\n' "$records" "$bytes" "$valid" "$buckets" "$endpoints" "$hosts" "$recovery" >"$work_dir/${j}.result"
    echo "TRUYN_D500_BOOTSTRAP_NODE_PASS host=${HOST_INDEX} node=${j} records=${records} valid=${valid} buckets=${buckets} endpoints=${endpoints} hosts=${hosts} recovery=${recovery}"
    return 0
  done
  echo "TRUYN_D500_BOOTSTRAP_NODE_FAIL host=${HOST_INDEX} node=${j} reason=recovery_exhausted" >&2
  return 1
}

t0=$(date +%s%3N)
failed_nodes=()
next=0
while [[ "$next" -lt "$NODES_PER_HOST" ]]; do
  end=$(( next + CONCURRENCY ))
  [[ "$end" -gt "$NODES_PER_HOST" ]] && end="$NODES_PER_HOST"
  declare -A batch_pids=()
  for j in $(seq "$next" $((end - 1))); do
    (run_node "$j") >"$work_dir/${j}.log" 2>&1 &
    batch_pids[$j]=$!
  done
  for j in $(seq "$next" $((end - 1))); do
    if ! wait "${batch_pids[$j]}"; then failed_nodes+=("$j"); fi
  done
  next="$end"
done

# Emit every node log before the host can fail so no first-failure truncation
# hides the remaining node outcomes.
for j in $(seq 0 $((NODES_PER_HOST - 1))); do cat "$work_dir/${j}.log"; done

min_records=999999; max_records=0; min_bytes=999999999; max_bytes=0; total_bytes=0
refresh_count=0; refresh_min_valid=999999; refresh_max_valid=0; refresh_min_buckets=999999; refresh_max_buckets=0
refresh_min_endpoints=999999; refresh_max_endpoints=0; refresh_min_hosts=999999; refresh_max_hosts=0; node_recoveries=0
for j in $(seq 0 $((NODES_PER_HOST - 1))); do
  [[ -s "$work_dir/${j}.result" ]] || continue
  read -r records bytes valid buckets endpoints hosts recovery <"$work_dir/${j}.result"
  (( records < min_records )) && min_records="$records"
  (( records > max_records )) && max_records="$records"
  (( bytes < min_bytes )) && min_bytes="$bytes"
  (( bytes > max_bytes )) && max_bytes="$bytes"
  total_bytes=$((total_bytes + bytes))
  (( valid < refresh_min_valid )) && refresh_min_valid="$valid"
  (( valid > refresh_max_valid )) && refresh_max_valid="$valid"
  (( buckets < refresh_min_buckets )) && refresh_min_buckets="$buckets"
  (( buckets > refresh_max_buckets )) && refresh_max_buckets="$buckets"
  (( endpoints < refresh_min_endpoints )) && refresh_min_endpoints="$endpoints"
  (( endpoints > refresh_max_endpoints )) && refresh_max_endpoints="$endpoints"
  (( hosts < refresh_min_hosts )) && refresh_min_hosts="$hosts"
  (( hosts > refresh_max_hosts )) && refresh_max_hosts="$hosts"
  refresh_count=$((refresh_count + 1))
  node_recoveries=$((node_recoveries + recovery))
done

t1=$(date +%s%3N)
mean_bytes=0
[[ "$refresh_count" -gt 0 ]] && mean_bytes=$((total_bytes / refresh_count))
failed_csv=none
[[ ${#failed_nodes[@]} -gt 0 ]] && failed_csv=$(IFS=,; echo "${failed_nodes[*]}")
echo BOOTSTRAP_MS=$((t1-t0))
echo BOOTSTRAP_PLAN_NODE_COUNT=$(jq -r '.nodeCount' "$PLAN_SUMMARY")
echo BOOTSTRAP_PLAN_MIN_RECORDS=$min_records
echo BOOTSTRAP_PLAN_MAX_RECORDS=$max_records
echo BOOTSTRAP_PLAN_ALL_TO_ALL=$(jq -r '.allToAll' "$PLAN_SUMMARY")
echo BOOTSTRAP_PLAN_MIN_FAILURE_DOMAINS=$(jq -r '.minFailureDomains' "$PLAN_SUMMARY")
echo BOOTSTRAP_PLAN_MAX_FAILURE_DOMAINS=$(jq -r '.maxFailureDomains' "$PLAN_SUMMARY")
echo BOOTSTRAP_MIN_BYTES=$min_bytes
echo BOOTSTRAP_MAX_BYTES=$max_bytes
echo BOOTSTRAP_MEAN_BYTES=$mean_bytes
echo BOOTSTRAP_REFRESH_COUNT=$refresh_count
echo BOOTSTRAP_REFRESH_STATUS=refreshed
echo BOOTSTRAP_REFRESH_MIN_VALID=$refresh_min_valid
echo BOOTSTRAP_REFRESH_MAX_VALID=$refresh_max_valid
echo BOOTSTRAP_REFRESH_MIN_BUCKETS=$refresh_min_buckets
echo BOOTSTRAP_REFRESH_MAX_BUCKETS=$refresh_max_buckets
echo BOOTSTRAP_REFRESH_MIN_ENDPOINTS=$refresh_min_endpoints
echo BOOTSTRAP_REFRESH_MAX_ENDPOINTS=$refresh_max_endpoints
echo BOOTSTRAP_REFRESH_MIN_HOSTS=$refresh_min_hosts
echo BOOTSTRAP_REFRESH_MAX_HOSTS=$refresh_max_hosts
echo BOOTSTRAP_NODE_RECOVERIES=$node_recoveries
echo BOOTSTRAP_FAILED_NODES=$failed_csv
echo "TRUYN_D500_BOOTSTRAP_HOST_SUMMARY host=${HOST_INDEX} attempted=${NODES_PER_HOST} passed=${refresh_count} failed=${#failed_nodes[@]} recoveries=${node_recoveries} concurrency=${CONCURRENCY} capS=${STAGE_CAP_S}"
[[ ${#failed_nodes[@]} -eq 0 ]]
''')
HELPER.chmod(0o755)

# Update the pre-existing time-budget tests so timeout classification is based on
# Azure instance view and the extracted remote() harness includes its helpers.
time_test = TIME_TEST.read_text()
old_harness = '''    shellFunction(provisionSource, 'd500_seconds_remaining'),
    shellFunction(provisionSource, 'remote'),
'''
new_harness = '''    shellFunction(provisionSource, 'd500_seconds_remaining'),
    shellFunction(provisionSource, 'd500_vm_agent_ready'),
    shellFunction(provisionSource, 'd500_run_command_extension_state'),
    shellFunction(provisionSource, 'd500_run_command_busy'),
    shellFunction(provisionSource, 'd500_wait_run_command_drain'),
    shellFunction(provisionSource, 'remote'),
'''
time_test = time_test.replace(old_harness, new_harness)
if time_test.count(new_harness) != 2:
    raise SystemExit('expected two remote test harnesses after helper insertion')

old_first = '''  await withAzStub('sleep 120', async (dir) => {
    const started = Date.now();
    const run = runRemote(dir, { REMOTE_TIMEOUT_S: '2', TRUYN_D500_REMOTE_ATTEMPTS: '3' }, 'remote vm-h0 true; echo "RC=$?"');
    const elapsedMs = Date.now() - started;
    assert.match(run.stdout, /RC=70/, `stdout=${run.stdout} stderr=${run.stderr}`);
    assert.match(run.stderr, /TRUYN_D500_REMOTE_TIMEOUT vm=vm-h0 attempt=1 capS=2/);
    assert.match(run.stderr, /TRUYN_D500_HOST_UNHEALTHY vm=vm-h0 rc=124 attempts=2 reason=vm_agent_unreachable/);
    assert.ok(elapsedMs < 60_000, `remote must give up fast, took ${elapsedMs}ms`);
  });
'''
new_first = '''  await withAzStub('if [[ "$*" == *"get-instance-view"* ]]; then exit 1; fi; sleep 120', async (dir) => {
    const started = Date.now();
    const run = runRemote(dir, { REMOTE_TIMEOUT_S: '2', TRUYN_D500_REMOTE_ATTEMPTS: '3' }, 'remote vm-h0 true; echo "RC=$?"');
    const elapsedMs = Date.now() - started;
    assert.match(run.stdout, /RC=70/, `stdout=${run.stdout} stderr=${run.stderr}`);
    assert.match(run.stderr, /TRUYN_D500_REMOTE_TIMEOUT vm=vm-h0 attempt=1 capS=2/);
    assert.match(run.stderr, /TRUYN_D500_HOST_UNHEALTHY vm=vm-h0 rc=70 attempts=1 reason=vm_agent_unreachable source=instance_view/);
    assert.ok(elapsedMs < 60_000, `remote must give up fast, took ${elapsedMs}ms`);
  });
'''
time_test = replace_once(time_test, old_first, new_first, 'time-budget timeout test')

old_second = '''  await withAzStub('echo "ERROR: (VMAgentStatusCommunicationError) agent unreachable" >&2; exit 1', async (dir) => {
'''
new_second = '''  await withAzStub('if [[ "$*" == *"get-instance-view"* ]]; then exit 1; fi; echo "ERROR: (VMAgentStatusCommunicationError) agent unreachable" >&2; exit 1', async (dir) => {
'''
time_test = replace_once(time_test, old_second, new_second, 'time-budget agent test')

old_transient_stub = '''    await writeFile(join(dir, 'az'), '#!/usr/bin/env bash\\nif [[ ! -f "$STATE/failed" ]]; then touch "$STATE/failed"; echo "ERROR: (Conflict) run command busy" >&2; exit 1; fi\\necho OK_MARKER=1\\n');
'''
new_transient_stub = '''    await writeFile(join(dir, 'az'), '#!/usr/bin/env bash\\nif [[ "$*" == *"get-instance-view"* ]]; then echo ProvisioningState/succeeded; exit 0; fi\\nif [[ ! -f "$STATE/failed" ]]; then touch "$STATE/failed"; echo "ERROR: (Conflict) Run command extension execution is in progress" >&2; exit 1; fi\\necho OK_MARKER=1\\n');
'''
time_test = replace_once(time_test, old_transient_stub, new_transient_stub, 'time-budget busy stub')
TIME_TEST.write_text(time_test)

RESILIENCE_TEST.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const provisionSource = await readFile('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');
const helperSource = await readFile('scripts/class-d-bootstrap-host-resilience.sh', 'utf8');

function shellFunction(source, name) {
  const match = source.match(new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}`, 'm'));
  assert.ok(match, `${name}() must exist`);
  return match[0];
}

function remoteHarness(body) {
  return [
    shellFunction(provisionSource, 'd500_seconds_remaining'),
    shellFunction(provisionSource, 'd500_vm_agent_ready'),
    shellFunction(provisionSource, 'd500_run_command_extension_state'),
    shellFunction(provisionSource, 'd500_run_command_busy'),
    shellFunction(provisionSource, 'd500_wait_run_command_drain'),
    shellFunction(provisionSource, 'remote'),
    'sleep() { :; }',
    'RG=rg',
    body,
  ].join('\n');
}

async function withCommandStubs(files, run) {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d500-resilience-'));
  try {
    for (const [name, source] of Object.entries(files)) {
      await writeFile(join(dir, name), `#!/usr/bin/env bash\n${source}\n`);
      await chmod(join(dir, name), 0o755);
    }
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function bootstrapFixture(recover) {
  return withCommandStubs({
    curl: `url="\\${!#}"\nport="\\$(sed -nE 's#.*127\\.0\\.0\\.1:([0-9]+).*#\\1#p' <<<"\\$url")"\nif [[ "\\$url" == */status ]]; then if [[ "\\$port" == 8701 && ! -f "\\$STATE/recovered" ]]; then exit 7; fi; echo '{}'; exit 0; fi\nif [[ "\\$url" == */bootstrap ]]; then echo '{}'; exit 0; fi\nif [[ "\\$url" == */dht/refresh ]]; then echo '{"refreshed":true}'; exit 0; fi\nif [[ "\\$url" == */dht/readiness ]]; then echo '{"refresh":{"status":"refreshed"},"validPeers":2,"populatedBuckets":2,"remoteEndpointDiversity":{"endpointCount":2,"hostCount":2}}'; exit 0; fi\nexit 2`,
    systemctl: `if [[ "\\$1" == restart ]]; then ${recover ? 'touch "$STATE/recovered"' : ':'}; fi\necho SYSTEMCTL "\\$*"\nexit 0`,
    journalctl: `echo JOURNAL "\\$*"`,
    dmesg: `echo 'Out of memory: fake regression evidence'`,
  }, async (dir) => {
    const records = [[
      { nodeId: 'n0', endpoints: ['q0'] },
      { nodeId: 'n1', endpoints: ['q1'] },
      { nodeId: 'n2', endpoints: ['q2'] },
    ]];
    const plan = {
      n0: [records[0][1], records[0][2]],
      n1: [records[0][0], records[0][2]],
      n2: [records[0][0], records[0][1]],
    };
    await writeFile(join(dir, 'records.json'), JSON.stringify(records));
    await writeFile(join(dir, 'plan.json'), JSON.stringify(plan));
    await writeFile(join(dir, 'summary.json'), JSON.stringify({ nodeCount: 3, minPeers: 2, maxPeers: 2, allToAll: false, minFailureDomains: 2, maxFailureDomains: 2 }));
    return spawnSync('bash', ['scripts/class-d-bootstrap-host-resilience.sh'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        STATE: dir,
        TRUYN_D500_BOOTSTRAP_HOST_INDEX: '0',
        TRUYN_D500_BOOTSTRAP_NODES_PER_HOST: '3',
        TRUYN_D500_BOOTSTRAP_CONTROL_BASE: '8700',
        TRUYN_D500_BOOTSTRAP_MAX_PEERS_PER_NODE: '2',
        TRUYN_D500_BOOTSTRAP_SEED: 'seed',
        TRUYN_D500_BOOTSTRAP_NODE_CONCURRENCY: '2',
        TRUYN_D500_BOOTSTRAP_STAGE_CAP_S: '20',
        TRUYN_D500_BOOTSTRAP_RECOVERY_PROBES: '1',
        TRUYN_D500_BOOTSTRAP_RECORDS_BY_HOST: join(dir, 'records.json'),
        TRUYN_D500_BOOTSTRAP_PLAN_BY_NODE: join(dir, 'plan.json'),
        TRUYN_D500_BOOTSTRAP_PLAN_SUMMARY: join(dir, 'summary.json'),
      },
    });
  });
}

test('systemd keeps benchmark nodes alive across clean exits and crash bursts', () => {
  assert.match(provisionSource, /StartLimitIntervalSec=0/);
  assert.match(provisionSource, /Restart=always/);
  assert.doesNotMatch(provisionSource, /Restart=on-failure/);
});

test('bootstrap keeps the qualified refresh contract while bounding host work', () => {
  assert.match(provisionSource, /TRUYN_D500_BOOTSTRAP_NODE_CONCURRENCY="\\$\\{TRUYN_D500_BOOTSTRAP_NODE_CONCURRENCY:-5\\}"/);
  assert.match(provisionSource, /TRUYN_D500_BOOTSTRAP_STAGE_CAP_S="\\$\\{TRUYN_D500_BOOTSTRAP_STAGE_CAP_S:-1500\\}"/);
  assert.match(provisionSource, /TRUYN_D500_BOOTSTRAP_REMOTE_TIMEOUT_S="\\$\\{TRUYN_D500_BOOTSTRAP_REMOTE_TIMEOUT_S:-1500\\}"/);
  assert.match(helperSource, /targetConcurrency:4/);
  assert.match(helperSource, /timeoutMs:240000/);
  assert.match(helperSource, /--max-time 300/);
});

test('a dead bootstrap node is diagnosed, restarted and counted before host PASS', async () => {
  const run = await bootstrapFixture(true);
  assert.equal(run.status, 0, `stdout=${run.stdout}\nstderr=${run.stderr}`);
  assert.match(run.stdout, /BOOTSTRAP_NODE_RECOVERIES=1/);
  assert.match(run.stdout, /BOOTSTRAP_FAILED_NODES=none/);
  assert.match(run.stdout, /TRUYN_D500_BOOTSTRAP_NODE_PASS host=0 node=0/);
  assert.match(run.stdout, /TRUYN_D500_BOOTSTRAP_NODE_PASS host=0 node=1/);
  assert.match(run.stdout, /TRUYN_D500_BOOTSTRAP_NODE_PASS host=0 node=2/);
  assert.match(run.stdout + run.stderr, /TRUYN_D500_BOOTSTRAP_NODE_DIAGNOSTIC host=0 node=1/);
});

test('an unrecoverable node fails the host only after every node was attempted and logged', async () => {
  const run = await bootstrapFixture(false);
  assert.notEqual(run.status, 0, `stdout=${run.stdout}\nstderr=${run.stderr}`);
  assert.match(run.stdout, /TRUYN_D500_BOOTSTRAP_NODE_PASS host=0 node=0/);
  assert.match(run.stdout + run.stderr, /TRUYN_D500_BOOTSTRAP_NODE_FAIL host=0 node=1/);
  assert.match(run.stdout, /TRUYN_D500_BOOTSTRAP_NODE_PASS host=0 node=2/);
  assert.match(run.stdout, /BOOTSTRAP_FAILED_NODES=1/);
});

test('run-command busy collision drains and retries without consuming an attempt', async () => {
  await withCommandStubs({
    az: `if [[ "\\$*" == *"get-instance-view"* ]]; then echo ProvisioningState/succeeded; exit 0; fi\ncount=0; [[ -f "\\$STATE/count" ]] && count=\\$(cat "\\$STATE/count"); count=\\$((count+1)); echo "\\$count" >"\\$STATE/count"\nif [[ "\\$count" == 1 ]]; then echo 'ERROR: (Conflict) Run command extension execution is in progress' >&2; exit 1; fi\necho OK_MARKER=1`,
  }, async (dir) => {
    const run = spawnSync('bash', ['-c', remoteHarness('remote vm-h6 true; echo "RC=$?"')], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, STATE: dir, TRUYN_D500_REMOTE_BUSY_WAITS: '2' } });
    assert.match(run.stdout, /OK_MARKER=1/);
    assert.match(run.stdout, /RC=0/);
    assert.match(run.stderr, /TRUYN_D500_REMOTE_BUSY vm=vm-h6 attempt=1/);
    assert.doesNotMatch(run.stderr, /TRUYN_REMOTE_RETRY vm=vm-h6 attempt=1/);
  });
});

test('a timed-out command with Azure agent Ready is slow rc=72, not dead-agent rc=70', async () => {
  await withCommandStubs({
    az: `if [[ "\\$*" == *"get-instance-view"* ]]; then echo ProvisioningState/succeeded; exit 0; fi\nsleep 5`,
  }, async (dir) => {
    const run = spawnSync('bash', ['-c', remoteHarness('remote vm-h13 true; echo "RC=$?"')], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, REMOTE_TIMEOUT_S: '1', TRUYN_D500_REMOTE_ATTEMPTS: '1', TRUYN_D500_REMOTE_DRAIN_S: '1' } });
    assert.match(run.stdout, /RC=72/, `stdout=${run.stdout} stderr=${run.stderr}`);
    assert.match(run.stderr, /TRUYN_D500_REMOTE_TIMEOUT vm=vm-h13 attempt=1 capS=1/);
    assert.match(run.stderr, /TRUYN_D500_HOST_SLOW vm=vm-h13 rc=72/);
    assert.doesNotMatch(run.stderr, /reason=vm_agent_unreachable/);
  });
});

test('vm_agent_unreachable rc=70 requires Azure instance view to fail readiness', async () => {
  await withCommandStubs({
    az: `if [[ "\\$*" == *"get-instance-view"* ]]; then echo ProvisioningState/failed; exit 0; fi\necho 'ERROR: (VMAgentStatusCommunicationError) agent unreachable' >&2; exit 1`,
  }, async (dir) => {
    const run = spawnSync('bash', ['-c', remoteHarness('remote vm-h13 true; echo "RC=$?"')], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } });
    assert.match(run.stdout, /RC=70/);
    assert.match(run.stderr, /TRUYN_D500_HOST_UNHEALTHY vm=vm-h13 rc=70/);
    assert.match(run.stderr, /source=instance_view/);
  });
});
''')

print('D500_ATTEMPT12_PATCHER=READY')
