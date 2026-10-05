#!/usr/bin/env python3
from pathlib import Path
import re
p=Path('benchmarks/scale/class-d-azure-1000-provision.sh')
s=p.read_text()
for x in ('BOOTSTRAP_MAX_PEERS_PER_NODE=32','bootstrap-record-refresh','targetConcurrency','timeoutMs'):
    if x not in s: raise SystemExit(f'current-main invariant missing: {x}')
remote=re.search(r'\nremote\(\) \{.*?\n\}\n\nmarker\(\)',s,re.S)
if not remote: raise SystemExit('remote function anchor missing')
new='''
remote() {
  local vm="$1" body="$2" enc remote_script output rc attempt attempts cap left unhealthy=0
  enc="$(printf '%s' "$body" | base64 -w0)"
  remote_script="printf '%s' '$enc' | base64 -d >/tmp/truyn-d1000-run.sh; chmod 700 /tmp/truyn-d1000-run.sh; /bin/bash /tmp/truyn-d1000-run.sh"
  remote_script="${remote_script//truyn/truyn}"
  remote_script="${remote_script//truyn/truyn}"
  attempts="${REMOTE_ATTEMPTS:-${TRUYN_D500_REMOTE_ATTEMPTS:-3}}"
  for ((attempt=1; attempt<=attempts; attempt++)); do
    cap="${REMOTE_TIMEOUT_S:-${TRUYN_D500_REMOTE_TIMEOUT_S:-600}}"
    left=$(( TRUYN_D500_DEADLINE_EPOCH - $(date +%s) ))
    if [[ "$left" -le 0 ]]; then echo "TRUYN_D500_REMOTE_ABORT vm=${vm} reason=campaign_budget_exhausted" >&2; return 75; fi
    [[ "$left" -lt "$cap" ]] && cap="$left"
    if output=$(timeout --signal=TERM --kill-after=30s "$cap" az vm run-command invoke -g "$RG" -n "$vm" --command-id RunShellScript --scripts "$remote_script" --query 'value[0].message' -o tsv --only-show-errors 2>&1); then rc=0; else rc=$?; fi
    printf '%s\\n' "$output" >&2
    if [[ $rc -eq 0 ]]; then printf '%s\\n' "$output"; return 0; fi
    if grep -Eqi 'OperationPreempted|OperationNotAllowed|Conflict|another operation|RunCommand.*(busy|in progress)' <<<"$output"; then
      echo "TRUYN_D500_RUN_COMMAND_CONFLICT vm=${vm} attempt=${attempt} rc=${rc}" >&2
    elif [[ $rc -eq 124 || $rc -eq 137 ]]; then
      unhealthy=1; echo "TRUYN_D500_REMOTE_TIMEOUT vm=${vm} attempt=${attempt} capS=${cap}" >&2
    elif grep -Eqi 'VMAgentStatusCommunicationError|VMExtensionProvisioningTimeout|VMExtensionHandlerNonTransientError|ExtensionFailedToProvision|GuestAgent.*(not ready|unresponsive)' <<<"$output"; then
      unhealthy=1; echo "TRUYN_D500_VM_AGENT_PATHOLOGY vm=${vm} attempt=${attempt} rc=${rc}" >&2
    fi
    echo "TRUYN_REMOTE_RETRY vm=${vm} attempt=${attempt} rc=${rc}" >&2
    [[ $unhealthy -eq 1 && $attempt -ge 2 ]] && break
    [[ $attempt -lt $attempts ]] || break
    sleep $((attempt*3))
  done
  echo "TRUYN_REMOTE_FAILURE vm=${vm} attempts=${attempt} rc=${rc}" >&2
  return "$rc"
}

marker()'''
s=s[:remote.start()]+new+s[remote.end():]
anchor='''if [[ "\\$ok" -ne 1 ]]; then
  echo "TRUYN_REMOTE_INSTALL_READINESS_FAILURE host=${i} expected=${NODES_PER_HOST} ready=\\${good}" >&2
  shown=0'''
recovery='''if [[ "\\$ok" -ne 1 ]]; then
  # D500_NODE_RECOVERY_ONCE: bounded recovery of only non-live services.
  recovered=0
  for j in \\$(seq 0 $((NODES_PER_HOST-1))); do
    idx=\\$(( ${i} * ${NODES_PER_HOST} + j )); port=\\$(( ${CONTROL_BASE} + j ))
    if ! curl -fsS --max-time 1 http://127.0.0.1:\\${port}/status >/dev/null 2>&1; then systemctl restart truyn-d1000@\\${idx}.service || true; recovered=1; fi
  done
  if [[ "\\$recovered" -eq 1 ]]; then
    for n in \\$(seq 1 20); do
      good=0
      for j in \\$(seq 0 $((NODES_PER_HOST-1))); do curl -fsS --max-time 1 http://127.0.0.1:\\$(( ${CONTROL_BASE} + j ))/status >/dev/null 2>&1 && good=\\$((good+1)); done
      if [[ "\\$good" -eq ${NODES_PER_HOST} ]]; then ok=1; break; fi
      sleep 2
    done
  fi
fi
if [[ "\\$ok" -ne 1 ]]; then
  echo "TRUYN_REMOTE_INSTALL_READINESS_FAILURE host=${i} expected=${NODES_PER_HOST} ready=\\${good}" >&2
  shown=0'''
if anchor not in s: raise SystemExit('readiness anchor missing')
s=s.replace(anchor,recovery,1)
insert='''TRUYN_D500_BUDGET_S="${TRUYN_D500_BUDGET_S:-9000}"
TRUYN_D500_REMOTE_TIMEOUT_S="${TRUYN_D500_REMOTE_TIMEOUT_S:-600}"
TRUYN_D500_REMOTE_ATTEMPTS="${TRUYN_D500_REMOTE_ATTEMPTS:-3}"
TRUYN_D500_DEADLINE_EPOCH="${TRUYN_D500_DEADLINE_EPOCH:-$(( $(date +%s) + TRUYN_D500_BUDGET_S ))}"
export TRUYN_D500_BUDGET_S TRUYN_D500_REMOTE_TIMEOUT_S TRUYN_D500_REMOTE_ATTEMPTS TRUYN_D500_DEADLINE_EPOCH
'''
needle='CLEANUP_CONFIRMED=false\nSTAGE=init\n'
if needle not in s: raise SystemExit('budget insertion anchor missing')
s=s.replace(needle,needle+'\n'+insert,1)
p.write_text(s)
print('D500_CURRENT_MAIN_REPAIR_COMPOSED')
