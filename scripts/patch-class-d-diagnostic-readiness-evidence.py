#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-readiness-evidence.py <campaign>')

path = Path(sys.argv[1])
text = path.read_text()

start = text.find('STAGE=readiness-barrier')
end = text.find('STAGE=convergence')
if start < 0 or end <= start:
    raise SystemExit('readiness/convergence stage boundaries not found')
block = text[start:end]
if 'D200_READINESS_EVIDENCE_V2=1' in block:
    raise SystemExit('readiness evidence patch already appears applied')
if 'D200_READINESS_WINDOW_HARDENED=1' not in block:
    raise SystemExit('readiness evidence patch requires readiness-window hardening first')

init_old = r'''readiness_last_hosts=-1
while [[ "\$(date +%s)" -lt "\$deadline" ]]; do
'''
init_new = r'''readiness_last_hosts=-1
readiness_observations_dir=\$(mktemp -d)
readiness_expected_hosts_json=\$(jq -c '[.[] | .[0].endpoints[0] | sub("^[^:]+://";"") | split(":")[0]]' /var/lib/truyqn-d1000/records-by-host.json)
[[ "\$(printf '%s' "\$readiness_expected_hosts_json" | jq 'length')" -eq ${HOST_COUNT} ]]
while [[ "\$(date +%s)" -lt "\$deadline" ]]; do
'''
if block.count(init_old) != 1:
    raise SystemExit(f'unexpected readiness evidence initialization count: {block.count(init_old)}')
block = block.replace(init_old, init_new, 1)

predicate = r'''    if [[ "\$propagation_ready" == true && "\$status" == refreshed && "\$valid" -ge ${BOOTSTRAP_MAX_PEERS_PER_NODE} && "\$buckets" -gt 0 && "\$hosts" -eq ${HOST_COUNT} ]]; then
      ready=\$((ready + 1))
    else
      readiness_predicate_failures=\$((readiness_predicate_failures + 1))
      readiness_last_failure_node=\$j
      readiness_last_failure_kind=predicate
      readiness_last_failure_rc=0
      readiness_last_status=\$status
      readiness_last_propagation_ready=\$propagation_ready
      readiness_last_pending=\$pending
      readiness_last_valid=\$valid
      readiness_last_buckets=\$buckets
      readiness_last_hosts=\$hosts
    fi
'''
observation = predicate + r'''    printf '%s' "\$readiness" | jq -c \
      --argjson node "\$j" \
      --argjson expected "\$readiness_expected_hosts_json" '
        . as \$r
        | (\$r.remoteEndpointDiversity.hosts // []) as \$present
        | {
            nodeIndex: \$node,
            observationUnavailable: false,
            acceptanceReady: (\$r.acceptanceReady // false),
            refreshStatus: (\$r.refresh.status // "unknown"),
            validPeers: (\$r.validPeers // 0),
            populatedBuckets: (\$r.populatedBuckets // 0),
            remoteHostCount: (\$r.remoteEndpointDiversity.hostCount // 0),
            missingHostIndexes: [
              \$expected | to_entries[] | . as \$entry
              | select((\$present | index(\$entry.value)) == null)
              | \$entry.key
            ],
            peerRecordSequence: (\$r.peerRecordSequence // null),
            oldestPeerRecordIssuedAt: (\$r.peerRecordLeases.oldestPeerRecordIssuedAt // null),
            nearestPeerRecordExpiryMs: (\$r.peerRecordLeases.nearestPeerRecordExpiryMs // null),
            expiredPeerRecords: (\$r.peerRecordLeases.expiredPeerRecords // null),
            peerRecordPropagation: {
              ready: (\$r.peerRecordPropagation.ready // false),
              targetCount: (\$r.peerRecordPropagation.targetCount // 0),
              acknowledgedCount: (\$r.peerRecordPropagation.acknowledgedCount // 0),
              pendingCount: (\$r.peerRecordPropagation.pendingCount // 0)
            },
            periodicRefreshLastResult: (\$r.periodicRefresh.lastResult // null)
          }
      ' > "\$readiness_observations_dir/\$j.json"
'''
if block.count(predicate) != 1:
    raise SystemExit(f'unexpected readiness predicate block count: {block.count(predicate)}')
block = block.replace(predicate, observation, 1)

guest_tail_old = r'''echo READINESS_LAST_HOSTS=\$readiness_last_hosts
[[ "\$ready" -eq ${NODES_PER_HOST} ]]
'''
guest_tail_new = r'''echo READINESS_LAST_HOSTS=\$readiness_last_hosts
for j in \$(seq 0 $((NODES_PER_HOST-1))); do
  if [[ ! -s "\$readiness_observations_dir/\$j.json" ]]; then
    printf '{"nodeIndex":%s,"observationUnavailable":true}\n' "\$j" > "\$readiness_observations_dir/\$j.json"
  fi
done
readiness_node_observations_b64=\$(jq -s -c 'sort_by(.nodeIndex)' "\$readiness_observations_dir"/*.json | base64 -w0)
echo READINESS_NODE_OBSERVATIONS_B64=\$readiness_node_observations_b64
rm -rf "\$readiness_observations_dir"
[[ "\$ready" -eq ${NODES_PER_HOST} ]]
'''
if block.count(guest_tail_old) != 1:
    raise SystemExit(f'unexpected readiness guest evidence tail count: {block.count(guest_tail_old)}')
block = block.replace(guest_tail_old, guest_tail_new, 1)

markers_old = 'for key in READINESS_READY READINESS_TOTAL READINESS_MIN_VALID READINESS_MAX_VALID READINESS_MIN_BUCKETS READINESS_MAX_BUCKETS READINESS_MIN_HOSTS READINESS_MAX_HOSTS; do'
markers_new = 'for key in READINESS_READY READINESS_TOTAL READINESS_MIN_VALID READINESS_MAX_VALID READINESS_MIN_BUCKETS READINESS_MAX_BUCKETS READINESS_MIN_HOSTS READINESS_MAX_HOSTS READINESS_NODE_OBSERVATIONS_B64; do'
if block.count(markers_old) != 1:
    raise SystemExit(f'unexpected readiness marker-list count: {block.count(markers_old)}')
block = block.replace(markers_old, markers_new, 1)

collection_old = '''readiness_collection_attempts=4
for i in $(seq 0 $((HOST_COUNT-1))); do
'''
collection_new = '''readiness_collection_attempts=4
readiness_gate_failed=0
for i in $(seq 0 $((HOST_COUNT-1))); do
'''
if block.count(collection_old) != 1:
    raise SystemExit(f'unexpected readiness collection loop count: {block.count(collection_old)}')
block = block.replace(collection_old, collection_new, 1)

fail_fast_old = '''  if [[ "$ready" != "$NODES_PER_HOST" || "$total" != "$NODES_PER_HOST" ]]; then
    curl_failures=$(marker "$out" READINESS_CURL_FAILURES); parse_failures=$(marker "$out" READINESS_PARSE_FAILURES); predicate_failures=$(marker "$out" READINESS_PREDICATE_FAILURES)
    last_failure_node=$(marker "$out" READINESS_LAST_FAILURE_NODE); last_failure_kind=$(marker "$out" READINESS_LAST_FAILURE_KIND); last_failure_rc=$(marker "$out" READINESS_LAST_FAILURE_RC)
    last_status=$(marker "$out" READINESS_LAST_STATUS); last_propagation_ready=$(marker "$out" READINESS_LAST_PROPAGATION_READY); last_pending=$(marker "$out" READINESS_LAST_PENDING)
    last_valid=$(marker "$out" READINESS_LAST_VALID); last_buckets=$(marker "$out" READINESS_LAST_BUCKETS); last_hosts=$(marker "$out" READINESS_LAST_HOSTS)
    echo "TRUYN_D200_READINESS_GATE_FAILURE host=$i ready=${ready}/${total} curlFailures=${curl_failures:-unknown} parseFailures=${parse_failures:-unknown} predicateFailures=${predicate_failures:-unknown} lastFailureNode=${last_failure_node:-unknown} lastFailureKind=${last_failure_kind:-unknown} lastFailureRc=${last_failure_rc:-unknown} lastStatus=${last_status:-unknown} lastPropagationReady=${last_propagation_ready:-unknown} lastPending=${last_pending:-unknown} lastValid=${last_valid:-unknown} lastBuckets=${last_buckets:-unknown} lastHosts=${last_hosts:-unknown}" >&2
    rm -rf "$readiness_dir"
    false
  fi
'''
fail_after_collect_new = '''  node_observations_b64=$(marker "$out" READINESS_NODE_OBSERVATIONS_B64)
  node_observations_file="$readiness_dir/$i.nodes.json"
  if [[ -z "$node_observations_b64" ]] || ! printf '%s' "$node_observations_b64" | base64 -d | jq -e 'type=="array" and length=='"$NODES_PER_HOST" >"$node_observations_file"; then
    printf '[]\n' >"$node_observations_file"
    readiness_gate_failed=1
    echo "TRUYN_D200_READINESS_OBSERVATION_ERROR node_observations_missing host=$i" >&2
  else
    tmp_nodes="$readiness_dir/$i.nodes.tmp.json"
    jq --argjson host "$i" 'map(. + {hostIndex:$host})' "$node_observations_file" >"$tmp_nodes"
    mv "$tmp_nodes" "$node_observations_file"
  fi
  if [[ "$ready" != "$NODES_PER_HOST" || "$total" != "$NODES_PER_HOST" ]]; then
    readiness_gate_failed=1
    curl_failures=$(marker "$out" READINESS_CURL_FAILURES); parse_failures=$(marker "$out" READINESS_PARSE_FAILURES); predicate_failures=$(marker "$out" READINESS_PREDICATE_FAILURES)
    last_failure_node=$(marker "$out" READINESS_LAST_FAILURE_NODE); last_failure_kind=$(marker "$out" READINESS_LAST_FAILURE_KIND); last_failure_rc=$(marker "$out" READINESS_LAST_FAILURE_RC)
    last_status=$(marker "$out" READINESS_LAST_STATUS); last_propagation_ready=$(marker "$out" READINESS_LAST_PROPAGATION_READY); last_pending=$(marker "$out" READINESS_LAST_PENDING)
    last_valid=$(marker "$out" READINESS_LAST_VALID); last_buckets=$(marker "$out" READINESS_LAST_BUCKETS); last_hosts=$(marker "$out" READINESS_LAST_HOSTS)
    echo "TRUYN_D200_READINESS_GATE_FAILURE host=$i ready=${ready}/${total} curlFailures=${curl_failures:-unknown} parseFailures=${parse_failures:-unknown} predicateFailures=${predicate_failures:-unknown} lastFailureNode=${last_failure_node:-unknown} lastFailureKind=${last_failure_kind:-unknown} lastFailureRc=${last_failure_rc:-unknown} lastStatus=${last_status:-unknown} lastPropagationReady=${last_propagation_ready:-unknown} lastPending=${last_pending:-unknown} lastValid=${last_valid:-unknown} lastBuckets=${last_buckets:-unknown} lastHosts=${last_hosts:-unknown}" >&2
    if [[ -s "$node_observations_file" ]]; then
      jq -c --argjson minPeers "$BOOTSTRAP_MAX_PEERS_PER_NODE" --argjson hostCount "$HOST_COUNT" '.[] | select(
        (.observationUnavailable == true) or
        (.acceptanceReady != true) or
        (.peerRecordPropagation.ready != true) or
        (.refreshStatus != "refreshed") or
        ((.validPeers // 0) < $minPeers) or
        ((.populatedBuckets // 0) <= 0) or
        ((.remoteHostCount // 0) != $hostCount)
      )' "$node_observations_file" | while IFS= read -r row; do
        echo "TRUYN_D200_READINESS_NODE_FAILURE host=$i observation=$row" >&2
      done
    fi
  fi
'''
if block.count(fail_fast_old) != 1:
    raise SystemExit(f'unexpected fail-fast readiness aggregate count: {block.count(fail_fast_old)}')
block = block.replace(fail_fast_old, fail_after_collect_new, 1)

finalize_old = '''done
rm -rf "$readiness_dir"
readiness_ms=$(( $(date +%s%3N) - readiness_start_ms ))
'''
finalize_new = '''done
readiness_observations_path="${GITHUB_WORKSPACE:-$PWD}/class-d-200-readiness-node-observations.json"
jq -s --argjson expectedHosts "$HOST_COUNT" --argjson expectedNodes "$NODE_COUNT" '{
  schema:"truyn.d200.readiness-observations.v1",
  expectedHostCount:$expectedHosts,
  expectedNodeCount:$expectedNodes,
  observations:(add | sort_by(.hostIndex,.nodeIndex))
}' "$readiness_dir"/*.nodes.json >"$readiness_observations_path"
readiness_ms=$(( $(date +%s%3N) - readiness_start_ms ))
rm -rf "$readiness_dir"
if [[ "$readiness_gate_failed" != 0 ]]; then
  echo "TRUYN_D200_READINESS_AGGREGATE_FAILURE ready=${readiness_ready}/${readiness_total} validMin=${readiness_min_valid} validMax=${readiness_max_valid} bucketsMin=${readiness_min_buckets} bucketsMax=${readiness_max_buckets} remoteHostsMin=${readiness_min_hosts} remoteHostsMax=${readiness_max_hosts} observations=${readiness_observations_path}" >&2
  false
fi
'''
if block.count(finalize_old) != 1:
    raise SystemExit(f'unexpected readiness finalization count: {block.count(finalize_old)}')
block = block.replace(finalize_old, finalize_new, 1)
block = block.replace('D200_READINESS_WINDOW_HARDENED=1\n', 'D200_READINESS_WINDOW_HARDENED=1\nD200_READINESS_EVIDENCE_V2=1\n', 1)

if '/need' in block:
    raise SystemExit('readiness evidence collection must remain read-only')
if block.count('deadline=\\$((\\$(date +%s) + 120))') != 1:
    raise SystemExit('readiness evidence repair must preserve one 120-second window')
if '"\\$hosts" -eq ${HOST_COUNT}' not in block:
    raise SystemExit('readiness evidence repair must preserve full host diversity')
if 'readiness_gate_failed=1' not in block or 'TRUYN_D200_READINESS_AGGREGATE_FAILURE' not in block:
    raise SystemExit('readiness evidence repair must fail only after aggregate collection')
for required in (
    r'. as \$r',
    r'nodeIndex: \$node',
    r'\$expected | to_entries[]',
    r'as \$entry',
    r'index(\$entry.value)',
    'missingHostIndexes',
    'oldestPeerRecordIssuedAt',
    'nearestPeerRecordExpiryMs',
    'expiredPeerRecords',
    'peerRecordSequence',
    'targetCount',
    'acknowledgedCount',
    'pendingCount',
    'periodicRefreshLastResult',
    'class-d-200-readiness-node-observations.json',
):
    if required not in block:
        raise SystemExit(f'readiness evidence missing required diagnostic: {required}')
if 'rm -rf "$readiness_dir"\n    false' in block:
    raise SystemExit('readiness evidence must not fail on the first semantically failing host')

text = text[:start] + block + text[end:]
path.write_text(text)
