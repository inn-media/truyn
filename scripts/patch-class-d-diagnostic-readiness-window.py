#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-readiness-window.py <campaign>')

path = Path(sys.argv[1])
text = path.read_text()

start = text.find('STAGE=readiness-barrier')
end = text.find('STAGE=convergence')
if start < 0 or end <= start:
    raise SystemExit('readiness/convergence stage boundaries not found')
block = text[start:end]
if 'D200_READINESS_WINDOW_HARDENED=1' in block:
    raise SystemExit('readiness window hardening patch already appears applied')

init_old = r'''max_hosts=0
while [[ "\$(date +%s)" -lt "\$deadline" ]]; do
'''
init_new = r'''max_hosts=0
readiness_curl_failures=0
readiness_parse_failures=0
readiness_predicate_failures=0
readiness_last_failure_node=-1
readiness_last_failure_kind=none
readiness_last_failure_rc=0
readiness_last_status=unknown
readiness_last_propagation_ready=unknown
readiness_last_pending=-1
readiness_last_valid=-1
readiness_last_buckets=-1
readiness_last_hosts=-1
while [[ "\$(date +%s)" -lt "\$deadline" ]]; do
'''
if block.count(init_old) != 1:
    raise SystemExit(f'unexpected readiness initialization count: {block.count(init_old)}')
block = block.replace(init_old, init_new, 1)

probe_old = r'''    readiness=\$(curl -fsS --max-time 10 "\${control_url}/dht/readiness")
    status=\$(printf '%s' "\$readiness" | jq -r '.refresh.status')
    propagation_ready=\$(printf '%s' "\$readiness" | jq -r '.acceptanceReady == true and .peerRecordPropagation.ready == true')
    valid=\$(printf '%s' "\$readiness" | jq -r '.validPeers')
    buckets=\$(printf '%s' "\$readiness" | jq -r '.populatedBuckets')
    hosts=\$(printf '%s' "\$readiness" | jq -r '.remoteEndpointDiversity.hostCount')
'''
probe_new = r'''    readiness_now=\$(date +%s)
    readiness_remaining=\$((deadline - readiness_now))
    if [[ "\$readiness_remaining" -le 0 ]]; then
      break
    fi
    readiness_probe_timeout=\$readiness_remaining
    if [[ "\$readiness_probe_timeout" -gt 10 ]]; then
      readiness_probe_timeout=10
    fi
    readiness=''
    if readiness=\$(curl -fsS --max-time "\$readiness_probe_timeout" "\${control_url}/dht/readiness" 2>/tmp/truyn-d200-readiness-curl-\${j}.err); then
      :
    else
      readiness_last_failure_rc=\$?
      readiness_curl_failures=\$((readiness_curl_failures + 1))
      readiness_last_failure_node=\$j
      readiness_last_failure_kind=curl
      readiness_last_status=unknown
      readiness_last_propagation_ready=unknown
      readiness_last_pending=-1
      readiness_last_valid=-1
      readiness_last_buckets=-1
      readiness_last_hosts=-1
      continue
    fi
    if [[ "\$(date +%s)" -ge "\$deadline" ]]; then
      break
    fi
    if ! printf '%s' "\$readiness" | jq -e . >/dev/null 2>&1; then
      readiness_parse_failures=\$((readiness_parse_failures + 1))
      readiness_last_failure_node=\$j
      readiness_last_failure_kind=json
      readiness_last_failure_rc=0
      readiness_last_status=unknown
      readiness_last_propagation_ready=unknown
      readiness_last_pending=-1
      readiness_last_valid=-1
      readiness_last_buckets=-1
      readiness_last_hosts=-1
      continue
    fi
    status=\$(printf '%s' "\$readiness" | jq -r '.refresh.status')
    propagation_ready=\$(printf '%s' "\$readiness" | jq -r '.acceptanceReady == true and .peerRecordPropagation.ready == true')
    pending=\$(printf '%s' "\$readiness" | jq -r '.peerRecordPropagation.pendingCount // -1')
    valid=\$(printf '%s' "\$readiness" | jq -r '.validPeers')
    buckets=\$(printf '%s' "\$readiness" | jq -r '.populatedBuckets')
    hosts=\$(printf '%s' "\$readiness" | jq -r '.remoteEndpointDiversity.hostCount')
    if [[ ! "\$pending" =~ ^-?[0-9]+$ || ! "\$valid" =~ ^[0-9]+$ || ! "\$buckets" =~ ^[0-9]+$ || ! "\$hosts" =~ ^[0-9]+$ ]]; then
      readiness_parse_failures=\$((readiness_parse_failures + 1))
      readiness_last_failure_node=\$j
      readiness_last_failure_kind=fields
      readiness_last_failure_rc=0
      readiness_last_status=unknown
      readiness_last_propagation_ready=unknown
      readiness_last_pending=-1
      readiness_last_valid=-1
      readiness_last_buckets=-1
      readiness_last_hosts=-1
      continue
    fi
'''
if block.count(probe_old) != 1:
    raise SystemExit(f'unexpected fail-fast readiness probe count: {block.count(probe_old)}')
block = block.replace(probe_old, probe_new, 1)

predicate_old = r'''    if [[ "\$propagation_ready" == true && "\$status" == refreshed && "\$valid" -ge ${BOOTSTRAP_MAX_PEERS_PER_NODE} && "\$buckets" -gt 0 && "\$hosts" -eq ${HOST_COUNT} ]]; then
      ready=\$((ready + 1))
    fi
'''
predicate_new = r'''    if [[ "\$propagation_ready" == true && "\$status" == refreshed && "\$valid" -ge ${BOOTSTRAP_MAX_PEERS_PER_NODE} && "\$buckets" -gt 0 && "\$hosts" -eq ${HOST_COUNT} ]]; then
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
if block.count(predicate_old) != 1:
    raise SystemExit(f'unexpected readiness predicate count: {block.count(predicate_old)}')
block = block.replace(predicate_old, predicate_new, 1)

guest_tail_old = r'''[[ "\$ready" -eq ${NODES_PER_HOST} ]]
echo READINESS_READY=\$ready
echo READINESS_TOTAL=${NODES_PER_HOST}
echo READINESS_MIN_VALID=\$min_valid
echo READINESS_MAX_VALID=\$max_valid
echo READINESS_MIN_BUCKETS=\$min_buckets
echo READINESS_MAX_BUCKETS=\$max_buckets
echo READINESS_MIN_HOSTS=\$min_hosts
echo READINESS_MAX_HOSTS=\$max_hosts
'''
guest_tail_new = r'''echo READINESS_READY=\$ready
echo READINESS_TOTAL=${NODES_PER_HOST}
echo READINESS_MIN_VALID=\$min_valid
echo READINESS_MAX_VALID=\$max_valid
echo READINESS_MIN_BUCKETS=\$min_buckets
echo READINESS_MAX_BUCKETS=\$max_buckets
echo READINESS_MIN_HOSTS=\$min_hosts
echo READINESS_MAX_HOSTS=\$max_hosts
echo READINESS_CURL_FAILURES=\$readiness_curl_failures
echo READINESS_PARSE_FAILURES=\$readiness_parse_failures
echo READINESS_PREDICATE_FAILURES=\$readiness_predicate_failures
echo READINESS_LAST_FAILURE_NODE=\$readiness_last_failure_node
echo READINESS_LAST_FAILURE_KIND=\$readiness_last_failure_kind
echo READINESS_LAST_FAILURE_RC=\$readiness_last_failure_rc
echo READINESS_LAST_STATUS=\$readiness_last_status
echo READINESS_LAST_PROPAGATION_READY=\$readiness_last_propagation_ready
echo READINESS_LAST_PENDING=\$readiness_last_pending
echo READINESS_LAST_VALID=\$readiness_last_valid
echo READINESS_LAST_BUCKETS=\$readiness_last_buckets
echo READINESS_LAST_HOSTS=\$readiness_last_hosts
[[ "\$ready" -eq ${NODES_PER_HOST} ]]
'''
if block.count(guest_tail_old) != 1:
    raise SystemExit(f'unexpected readiness guest tail count: {block.count(guest_tail_old)}')
block = block.replace(guest_tail_old, guest_tail_new, 1)

aggregate_old = '''  ready=$(marker "$out" READINESS_READY); total=$(marker "$out" READINESS_TOTAL)\n  [[ "$ready" == "$NODES_PER_HOST" ]]\n  [[ "$total" == "$NODES_PER_HOST" ]]\n'''
aggregate_new = '''  ready=$(marker "$out" READINESS_READY); total=$(marker "$out" READINESS_TOTAL)\n  if [[ "$ready" != "$NODES_PER_HOST" || "$total" != "$NODES_PER_HOST" ]]; then\n    curl_failures=$(marker "$out" READINESS_CURL_FAILURES); parse_failures=$(marker "$out" READINESS_PARSE_FAILURES); predicate_failures=$(marker "$out" READINESS_PREDICATE_FAILURES)\n    last_failure_node=$(marker "$out" READINESS_LAST_FAILURE_NODE); last_failure_kind=$(marker "$out" READINESS_LAST_FAILURE_KIND); last_failure_rc=$(marker "$out" READINESS_LAST_FAILURE_RC)\n    last_status=$(marker "$out" READINESS_LAST_STATUS); last_propagation_ready=$(marker "$out" READINESS_LAST_PROPAGATION_READY); last_pending=$(marker "$out" READINESS_LAST_PENDING)\n    last_valid=$(marker "$out" READINESS_LAST_VALID); last_buckets=$(marker "$out" READINESS_LAST_BUCKETS); last_hosts=$(marker "$out" READINESS_LAST_HOSTS)\n    echo "TRUYN_D200_READINESS_GATE_FAILURE host=$i ready=${ready}/${total} curlFailures=${curl_failures:-unknown} parseFailures=${parse_failures:-unknown} predicateFailures=${predicate_failures:-unknown} lastFailureNode=${last_failure_node:-unknown} lastFailureKind=${last_failure_kind:-unknown} lastFailureRc=${last_failure_rc:-unknown} lastStatus=${last_status:-unknown} lastPropagationReady=${last_propagation_ready:-unknown} lastPending=${last_pending:-unknown} lastValid=${last_valid:-unknown} lastBuckets=${last_buckets:-unknown} lastHosts=${last_hosts:-unknown}" >&2\n    rm -rf "$readiness_dir"\n    false\n  fi\n'''
if block.count(aggregate_old) != 1:
    raise SystemExit(f'unexpected readiness aggregate gate count: {block.count(aggregate_old)}')
block = block.replace(aggregate_old, aggregate_new, 1)

block = block.replace('STAGE=readiness-barrier\n', 'STAGE=readiness-barrier\nD200_READINESS_WINDOW_HARDENED=1\n', 1)

if '/need' in block:
    raise SystemExit('readiness hardening must not issue application /need calls')
if block.count('deadline=\\$((\\$(date +%s) + 120))') != 1:
    raise SystemExit('readiness hardening must preserve exactly one 120-second window')
if '"\\$valid" -ge ${BOOTSTRAP_MAX_PEERS_PER_NODE}' not in block:
    raise SystemExit('readiness hardening must preserve peer bound')
if '"\\$hosts" -eq ${HOST_COUNT}' not in block:
    raise SystemExit('readiness hardening must preserve full host-diversity bound')
if 'if readiness=\\$(curl -fsS --max-time "\\$readiness_probe_timeout"' not in block:
    raise SystemExit('readiness curl must be guarded and capped to the remaining deadline')
if 'readiness_remaining=\\$((deadline - readiness_now))' not in block or '"\\$(date +%s)" -ge "\\$deadline"' not in block:
    raise SystemExit('readiness probes must enforce the same 120-second deadline inside each node sweep')
for required in ('readiness_curl_failures=', 'readiness_predicate_failures=', 'READINESS_LAST_PENDING=', 'TRUYN_D200_READINESS_GATE_FAILURE'):
    if required not in block:
        raise SystemExit(f'readiness hardening must emit actionable failure evidence: missing {required}')

text = text[:start] + block + text[end:]
path.write_text(text)
