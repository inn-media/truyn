#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-packet-partition.py <campaign>')

path = Path(sys.argv[1])
text = path.read_text()

start_marker = 'STAGE=packet-partition\n'
end_marker = 'STAGE=healed-routing\n'
if text.count(start_marker) != 1:
    raise SystemExit(f'unexpected packet-partition stage count: {text.count(start_marker)}')
if text.count(end_marker) != 1:
    raise SystemExit(f'unexpected healed-routing stage count: {text.count(end_marker)}')

start = text.index(start_marker)
end = text.index(end_marker)
block = text[start:end]

required = {
    'real packet DROP': ("iptables -I OUTPUT 1 -p udp -d '${block_ip}'", 1),
    'real packet heal': ("iptables -D OUTPUT -p udp -d '${block_ip}'", 1),
    'blocked-success gate': ('[[ "$partition_successes" == 0 ]]', 1),
    'heal retry count': ('for n in $(seq 1 90); do', 1),
    'heal probe': ("curl -sS --max-time 6 -o /tmp/d1000-heal -w '%{http_code}'", 1),
    'heal success checks': ('[[ "$(marker "$out" HEAL_CODE)" == 200 ]]', 2),
    'recovery gate': ('[[ "$partition_recovery_ms" -le 120000 ]]', 1),
}
if 'PACKET_DIAG_PHASE=heal-timeout' in block:
    raise SystemExit('packet-partition block already appears patched')
for label, (snippet, expected) in required.items():
    actual = block.count(snippet)
    if actual != expected:
        raise SystemExit(f'unexpected {label} count: {actual} (expected {expected})')

old = '''[[ "$(marker "$out" HEAL_CODE)" == 200 ]]
partition_recovery_ms=$(( $(date +%s%3N) - heal_start ))
'''
if block.count(old) != 1:
    raise SystemExit(f'unexpected heal terminal count: {block.count(old)}')

new = r'''heal_code=$(marker "$out" HEAL_CODE)
if [[ "$heal_code" != 200 ]]; then
  packet_partition_diag=$(remote "${VMS[0]}" "set +e; echo PACKET_DIAG_PHASE=heal-timeout; echo PACKET_DIAG_PROCESS_COUNT=\$(pgrep -fc 'network/testnet/node-service.js'); rules=\$(iptables-save | grep -c 'truyn-d1000-partition' || true); echo PACKET_DIAG_PARTITION_RULE_COUNT=\$rules; echo PACKET_DIAG_CONTROL_LISTENERS=\$(ss -ltnH | grep -E '127\.0\.0\.1:(${CONTROL_BASE}|$((CONTROL_BASE+1))|$((CONTROL_BASE+2))|$((CONTROL_BASE+3))|$((CONTROL_BASE+4)))' | awk '{printf \"%s,\",\$4}'); echo PACKET_DIAG_QUIC_LISTENERS=\$(ss -lunH | grep -E ':(${QUIC_BASE}|$((QUIC_BASE+1))|$((QUIC_BASE+2))|$((QUIC_BASE+3))|$((QUIC_BASE+4)))' | awk '{printf \"%s,\",\$4}'); for j in \$(seq 0 4); do unit=truyn-d1000@\${j}.service; active=\$(systemctl show \"\$unit\" -p ActiveState --value); sub=\$(systemctl show \"\$unit\" -p SubState --value); result=\$(systemctl show \"\$unit\" -p Result --value); pid=\$(systemctl show \"\$unit\" -p MainPID --value); restarts=\$(systemctl show \"\$unit\" -p NRestarts --value); code=\$(systemctl show \"\$unit\" -p ExecMainCode --value); status=\$(systemctl show \"\$unit\" -p ExecMainStatus --value); changed=\$(systemctl show \"\$unit\" -p StateChangeTimestamp --value); echo PACKET_DIAG_UNIT=\$unit active=\$active sub=\$sub result=\$result pid=\$pid restarts=\$restarts execCode=\$code execStatus=\$status changed=\"\$changed\"; done")
  printf '%s\n' "$packet_partition_diag"
  for packet_diag_j in $(seq 0 4); do
    packet_diag_unit="truyn-d1000@${packet_diag_j}.service"
    packet_partition_journal=$(remote "${VMS[0]}" "set +e; journalctl -u '${packet_diag_unit}' -n 20 --no-pager -o short-iso | tail -c 3072; echo; echo PACKET_DIAG_JOURNAL_UNIT='${packet_diag_unit}'")
    printf '%s\n' "$packet_partition_journal"
  done
  failure_tmp="${EVIDENCE}.d200-failure.tmp"
  cat >"$failure_tmp" <<JSON
{
  "class":"D-1000",
  "scope":"1000-real-process-scale+safety-contract-v2",
  "testedCommit":"${GITHUB_SHA}",
  "workflowRunId":"${GITHUB_RUN_ID}",
  "topology":{"nodeCount":${NODE_COUNT},"realProcessCount":${NODE_COUNT},"hostCount":${HOST_COUNT},"realProcessesPerHost":${NODES_PER_HOST},"uniqueIdentityCount":${NODE_COUNT},"uniqueEndpointCount":${NODE_COUNT},"syntheticNodeCount":0},
  "readiness":{"readyNodeCount":${readiness_ready},"readyNodeRatio":1,"barrierMs":${readiness_ms},"validPeers":{"min":${readiness_min_valid},"max":${readiness_max_valid}},"populatedBuckets":{"min":${readiness_min_buckets},"max":${readiness_max_buckets}},"remoteEndpointHosts":{"min":${readiness_min_hosts},"max":${readiness_max_hosts}}},
  "routing":{"baselineSuccessRatio":${base_rate},"baselineProbes":${base_total},"postRestartSuccessRatio":${post_rate},"healedSuccessRatio":null,"healedProbes":0,"latencyMs":{"aggregation":"max-of-host-quantiles","p50":${base_p50},"p90":${base_p90},"p95":${base_p95},"p99":${base_p99}}},
  "convergence":{"probeMode":"parallel-host-fanout","hostCount":${HOST_COUNT},"aggregation":"max-of-host-quantiles","aggregateMs":${conv_ms},"latencyMs":{"p95":${conv_p95},"p99":${conv_p99}},"routingSuccessRatio":${conv_rate},"nodeProbeCount":${conv_total}},
  "recovery":{"latencyMs":{"p95":${recovery_p95}},"restartedNodeCount":100,"identityAndStatePathsPreserved":true,"packetPartitionRecoveryMs":null},
  "adversarial":{"packetPartition":{"exercised":true,"realPacketPath":true,"blockedSuccesses":${partition_successes},"probeCount":${partition_probes},"recoveryMs":null}},
  "safety":{"acknowledgedWriteCount":${writes},"acknowledgedWriteLossCount":null,"invalidSignedStateAcceptedCount":${invalid_signed_state_accepted},"staleRevokedReceiptAcceptedCount":${stale_receipt_accepted},"unauthorizedProviderExecutionCount":${unauthorized_provider_execution}},
  "resources":{},
  "failure":{"stage":"packet-partition","reason":"heal-timeout","healCode":"${heal_code}","evidenceComplete":false},
  "cleanup":{"confirmed":false,"remainingResources":null,"finalizedByExitTrap":true}
}
JSON
  mv "$failure_tmp" "$EVIDENCE"
  echo "TRUYN_D200_FAILURE_EVIDENCE=CHECKPOINT stage=packet-partition reason=heal-timeout healCode=${heal_code}"
fi
[[ "$heal_code" == 200 ]]
partition_recovery_ms=$(( $(date +%s%3N) - heal_start ))
'''

block = block.replace(old, new)
text = text[:start] + block + text[end:]
path.write_text(text)
