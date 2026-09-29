#!/usr/bin/env python3
from pathlib import Path
import re

PROV = Path('benchmarks/scale/class-d-azure-1000-provision.sh')
text = PROV.read_text()

# This helper is deliberately applied AFTER checkout/reset to the immutable
# Attempt-11 candidate. Never replace the whole provisioner from current main:
# that would erase its qualified time-budget and host-fanout repair.
for marker in ('d500_seconds_remaining()', '/bootstrap', '/dht/refresh', '/dht/readiness', 'BOOTSTRAP_MAX_PEERS_PER_NODE=32'):
    if marker not in text:
        raise SystemExit(f'Attempt-11 candidate missing required invariant: {marker}')

# Host-5/node-2 class: after the normal 120-probe readiness window, restart only
# nodes that are not serving /status, then give them one bounded recovery window.
# Topology, node count, identities, routing and evaluators remain unchanged.
old = '''if [[ "\\$ok" -ne 1 ]]; then
  echo "TRUYN_REMOTE_INSTALL_READINESS_FAILURE host=${i} expected=${NODES_PER_HOST} ready=\\${good}" >&2
  shown=0'''
new = '''if [[ "\\$ok" -ne 1 ]]; then
  # D500_NODE_RECOVERY_ONCE: bounded recovery of only non-live services.
  recovered=0
  for j in \\$(seq 0 $((NODES_PER_HOST-1))); do
    idx=\\$(( ${i} * ${NODES_PER_HOST} + j ))
    port=\\$(( ${CONTROL_BASE} + j ))
    if ! curl -fsS --max-time 1 http://127.0.0.1:\\${port}/status >/dev/null 2>&1; then
      systemctl restart truyn-d1000@\\${idx}.service || true
      recovered=1
    fi
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
if 'D500_NODE_RECOVERY_ONCE' not in text:
    if old not in text:
        raise SystemExit('install readiness anchor not found')
    text = text.replace(old, new, 1)

# Hosts-6/13 class: preserve Attempt-11 client timeout and fail-fast unhealthy
# agent logic, but recognize Azure Run Command conflict/busy as transient and
# drain it with the already bounded retry loop. No extra attempts are added.
if 'D500_RUN_COMMAND_CONFLICT_DRAIN' not in text:
    anchor = '''    if [[ $rc -eq 124 || $rc -eq 137 ]]; then
      unhealthy=1'''
    replacement = '''    # D500_RUN_COMMAND_CONFLICT_DRAIN: Azure may reject a new Run Command while
    # the previous extension operation is still transitioning. Treat only that
    # explicit conflict/busy family as transient; timeout/agent pathology stays
    # fail-fast below and the existing attempt/budget caps remain authoritative.
    if grep -Eqi 'OperationPreempted|OperationNotAllowed|Conflict|another operation|RunCommand.*(busy|in progress)' <<<"$output"; then
      echo "TRUYN_D500_RUN_COMMAND_CONFLICT vm=${vm} attempt=${attempt} rc=${rc}" >&2
    elif [[ $rc -eq 124 || $rc -eq 137 ]]; then
      unhealthy=1'''
    if anchor not in text:
        raise SystemExit('remote timeout anchor not found')
    text = text.replace(anchor, replacement, 1)

# Existing concurrency evaluator expects indexed waits so failures remain bound
# to the correct host. Preserve fanout; only make bootstrap wait shape explicit.
text = text.replace('for pid in "${bootstrap_pids[@]}"; do wait "$pid"; done',
                    'for i in $(seq 0 $((HOST_COUNT-1))); do wait "${bootstrap_pids[$i]}"; done')

PROV.write_text(text)
print('D500_ATTEMPT11_COMPOSED_REPAIR_APPLIED')
