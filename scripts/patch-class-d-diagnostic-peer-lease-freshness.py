#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-peer-lease-freshness.py <provisioner>')

path = Path(sys.argv[1])
text = path.read_text()

if 'D200_PEER_LEASE_FRESHNESS_REPAIR=1' in text:
    raise SystemExit('peer lease freshness repair already appears applied')

constants_old = '''BOOTSTRAP_MAX_PEERS_PER_NODE=32
BOOTSTRAP_PEERS_PER_BUCKET=2
QUIC_BASE=4400
'''
constants_new = '''BOOTSTRAP_MAX_PEERS_PER_NODE=32
BOOTSTRAP_PEERS_PER_BUCKET=2
BOOTSTRAP_MIN_PEER_LEASE_REMAINING_MS=900000
QUIC_BASE=4400
'''
if text.count(constants_old) != 1:
    raise SystemExit(f'unexpected bootstrap constants count: {text.count(constants_old)}')
text = text.replace(constants_old, constants_new, 1)

bootstrap_head = '''STAGE=bootstrap
IPS_JSON=$(printf '%s\\n' "${PRIV[@]}" | jq -R . | jq -s -c .)
'''
refresh_stage = r'''STAGE=bootstrap-record-refresh
D200_PEER_LEASE_FRESHNESS_REPAIR=1
bootstrap_record_refresh_dir=$(mktemp -d)
bootstrap_record_refresh_pids=()
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
python3 - <<'PY'
import json, os, urllib.request
from datetime import datetime, timezone

base=${CONTROL_BASE}
count=${NODES_PER_HOST}
minimum_remaining_ms=${BOOTSTRAP_MIN_PEER_LEASE_REMAINING_MS}
records=[]
now=datetime.now(timezone.utc)
oldest_issued=None
minimum_remaining=None

for j in range(count):
    with urllib.request.urlopen(f'http://127.0.0.1:{base+j}/record', timeout=10) as response:
        value=json.load(response)
    record=value.get('record')
    if not isinstance(record, dict) or not record.get('nodeId') or not record.get('endpoints'):
        raise SystemExit(f'live peer record missing required fields for node {j}')
    issued_raw=record.get('issuedAt')
    expires_raw=record.get('expiresAt')
    if not issued_raw or not expires_raw:
        raise SystemExit(f'live peer record missing lease timestamps for node {j}')
    issued=datetime.fromisoformat(issued_raw.replace('Z','+00:00'))
    expires=datetime.fromisoformat(expires_raw.replace('Z','+00:00'))
    if issued.tzinfo is None or expires.tzinfo is None or expires <= issued:
        raise SystemExit(f'invalid live peer lease timestamps for node {j}')
    remaining=int((expires-now).total_seconds()*1000)
    minimum_remaining=remaining if minimum_remaining is None else min(minimum_remaining, remaining)
    oldest_issued=issued if oldest_issued is None or issued < oldest_issued else oldest_issued
    records.append(record)

if len(records) != count:
    raise SystemExit(f'live peer record count mismatch: {len(records)} != {count}')
if len({record['nodeId'] for record in records}) != count:
    raise SystemExit('live peer record identity count mismatch')
if len({record['endpoints'][0] for record in records}) != count:
    raise SystemExit('live peer record endpoint count mismatch')
if minimum_remaining is None or minimum_remaining < minimum_remaining_ms:
    raise SystemExit(f'peer lease freshness margin failed: remainingMs={minimum_remaining} requiredMs={minimum_remaining_ms}')

final='/var/lib/truyn-d1000/records.json'
temporary=f'{final}.fresh-{os.getpid()}'
with open(temporary, 'w', encoding='utf-8') as handle:
    json.dump(records, handle, separators=(',',':'))
    handle.flush()
    os.fsync(handle.fileno())
os.replace(temporary, final)
print(f'BOOTSTRAP_RECORD_REFRESH_COUNT={len(records)}')
print(f'BOOTSTRAP_RECORD_REFRESH_MIN_REMAINING_MS={minimum_remaining}')
print(f'BOOTSTRAP_RECORD_REFRESH_OLDEST_ISSUED_AT={oldest_issued.isoformat()}')
PY
EOS
)
  (remote "${VMS[$i]}" "$script" >"$bootstrap_record_refresh_dir/$i") &
  bootstrap_record_refresh_pids+=("$!")
done
bootstrap_record_refresh_failed=0
for pid in "${bootstrap_record_refresh_pids[@]}"; do
  if ! wait "$pid"; then bootstrap_record_refresh_failed=1; fi
done
bootstrap_record_refresh_hosts=0
bootstrap_record_refresh_min_remaining=999999999
for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$bootstrap_record_refresh_dir/$i")"
  count=$(marker "$out" BOOTSTRAP_RECORD_REFRESH_COUNT)
  remaining=$(marker "$out" BOOTSTRAP_RECORD_REFRESH_MIN_REMAINING_MS)
  [[ "$count" == "$NODES_PER_HOST" ]]
  [[ "$remaining" =~ ^[0-9]+$ ]]
  [[ "$remaining" -ge "$BOOTSTRAP_MIN_PEER_LEASE_REMAINING_MS" ]]
  if [[ "$remaining" -lt "$bootstrap_record_refresh_min_remaining" ]]; then bootstrap_record_refresh_min_remaining="$remaining"; fi
  bootstrap_record_refresh_hosts=$((bootstrap_record_refresh_hosts+1))
  echo "TRUYN_CLASS_D_1000 stage=bootstrap-record-refresh host=$i records=$count minLeaseRemainingMs=$remaining status=PASS"
done
rm -rf "$bootstrap_record_refresh_dir"
[[ "$bootstrap_record_refresh_failed" == 0 ]]
[[ "$bootstrap_record_refresh_hosts" == "$HOST_COUNT" ]]
echo "TRUYN_CLASS_D_1000 stage=bootstrap-record-refresh hosts=${bootstrap_record_refresh_hosts}/${HOST_COUNT} records=${NODE_COUNT} minLeaseRemainingMs=${bootstrap_record_refresh_min_remaining} requiredMarginMs=${BOOTSTRAP_MIN_PEER_LEASE_REMAINING_MS} status=PASS"

STAGE=bootstrap
IPS_JSON=$(printf '%s\n' "${PRIV[@]}" | jq -R . | jq -s -c .)
'''
if text.count(bootstrap_head) != 1:
    raise SystemExit(f'unexpected bootstrap stage head count: {text.count(bootstrap_head)}')
text = text.replace(bootstrap_head, refresh_stage, 1)

planner_env_old = "TRUYN_BOOTSTRAP_PLAN_SEED='${GITHUB_SHA}' TRUYN_BOOTSTRAP_MAX_PEERS_PER_NODE=${BOOTSTRAP_MAX_PEERS_PER_NODE} TRUYN_BOOTSTRAP_PEERS_PER_BUCKET=${BOOTSTRAP_PEERS_PER_BUCKET} node --input-type=module <<'NODE'"
planner_env_new = "TRUYN_BOOTSTRAP_PLAN_SEED='${GITHUB_SHA}' TRUYN_BOOTSTRAP_MAX_PEERS_PER_NODE=${BOOTSTRAP_MAX_PEERS_PER_NODE} TRUYN_BOOTSTRAP_PEERS_PER_BUCKET=${BOOTSTRAP_PEERS_PER_BUCKET} TRUYN_BOOTSTRAP_REQUIRED_FAILURE_DOMAINS=${HOST_COUNT} node --input-type=module <<'NODE'"
if text.count(planner_env_old) != 1:
    raise SystemExit(f'unexpected bootstrap planner invocation count: {text.count(planner_env_old)}')
text = text.replace(planner_env_old, planner_env_new, 1)

parse_old = "const peersPerBucket = Number.parseInt(process.env.TRUYN_BOOTSTRAP_PEERS_PER_BUCKET || '2', 10);\n"
parse_new = parse_old + "const requiredFailureDomains = Number.parseInt(process.env.TRUYN_BOOTSTRAP_REQUIRED_FAILURE_DOMAINS || '0', 10);\n"
if text.count(parse_old) != 1:
    raise SystemExit(f'unexpected peersPerBucket parse count: {text.count(parse_old)}')
text = text.replace(parse_old, parse_new, 1)

options_old = '''  seed: process.env.TRUYN_BOOTSTRAP_PLAN_SEED || 'truyn-class-d-1000',
  maxPeersPerNode,
  peersPerBucket
});
'''
options_new = '''  seed: process.env.TRUYN_BOOTSTRAP_PLAN_SEED || 'truyn-class-d-1000',
  maxPeersPerNode,
  peersPerBucket,
  requiredFailureDomains
});
'''
if text.count(options_old) != 1:
    raise SystemExit(f'unexpected bootstrap planner options count: {text.count(options_old)}')
text = text.replace(options_old, options_new, 1)

summary_gate_old = "if (summary.allToAll) throw new Error('bootstrap plan must not be all-to-all');\n"
summary_gate_new = summary_gate_old + "if (summary.minFailureDomains !== requiredFailureDomains || summary.maxFailureDomains !== requiredFailureDomains) throw new Error('bootstrap plan failure-domain coverage mismatch');\n"
if text.count(summary_gate_old) != 1:
    raise SystemExit(f'unexpected all-to-all summary gate count: {text.count(summary_gate_old)}')
text = text.replace(summary_gate_old, summary_gate_new, 1)

summary_echo_old = "echo BOOTSTRAP_PLAN_ALL_TO_ALL=\\$(jq -r '.allToAll' /tmp/bootstrap-plan-summary.json)\n"
summary_echo_new = summary_echo_old + "echo BOOTSTRAP_PLAN_MIN_FAILURE_DOMAINS=\\$(jq -r '.minFailureDomains' /tmp/bootstrap-plan-summary.json)\necho BOOTSTRAP_PLAN_MAX_FAILURE_DOMAINS=\\$(jq -r '.maxFailureDomains' /tmp/bootstrap-plan-summary.json)\n"
if text.count(summary_echo_old) != 1:
    raise SystemExit(f'unexpected bootstrap plan summary echo count: {text.count(summary_echo_old)}')
text = text.replace(summary_echo_old, summary_echo_new, 1)

controller_gate_old = '''    [[ "$(marker "$out" BOOTSTRAP_PLAN_ALL_TO_ALL)" == false ]]
    [[ "$(marker "$out" BOOTSTRAP_REFRESH_COUNT)" == "$NODES_PER_HOST" ]]
'''
controller_gate_new = '''    [[ "$(marker "$out" BOOTSTRAP_PLAN_ALL_TO_ALL)" == false ]]
    [[ "$(marker "$out" BOOTSTRAP_PLAN_MIN_FAILURE_DOMAINS)" == "$HOST_COUNT" ]]
    [[ "$(marker "$out" BOOTSTRAP_PLAN_MAX_FAILURE_DOMAINS)" == "$HOST_COUNT" ]]
    [[ "$(marker "$out" BOOTSTRAP_REFRESH_COUNT)" == "$NODES_PER_HOST" ]]
'''
if text.count(controller_gate_old) != 1:
    raise SystemExit(f'unexpected parallel bootstrap controller gate count: {text.count(controller_gate_old)}')
text = text.replace(controller_gate_old, controller_gate_new, 1)
text = text.replace('plan=per-node-xor refresh=per-node', 'plan=host-stratified-xor refresh=per-node', 1)

bootstrap_start = text.find('STAGE=bootstrap\n')
bandwidth_start = text.find('STAGE=bandwidth-meter', bootstrap_start)
if bootstrap_start < 0 or bandwidth_start <= bootstrap_start:
    raise SystemExit('bootstrap/bandwidth stage boundaries not found after repair')
bootstrap_block = text[bootstrap_start:bandwidth_start]
refresh_start = text.find('STAGE=bootstrap-record-refresh')
if refresh_start < 0 or refresh_start >= bootstrap_start:
    raise SystemExit('live peer record refresh must run immediately before bootstrap')
if '/need' in text[refresh_start:bandwidth_start]:
    raise SystemExit('peer lease/bootstrap repair must not issue application /need calls')
if 'TRUYN_PEER_RECORD_TTL_MS=1800000' not in text:
    raise SystemExit('peer lease repair must preserve the 30-minute D-200 peer-record TTL')
if 'TRUYN_BOOTSTRAP_REQUIRED_FAILURE_DOMAINS=${HOST_COUNT}' not in bootstrap_block:
    raise SystemExit('D-200 bootstrap must require all physical failure domains')
if 'BOOTSTRAP_MAX_PEERS_PER_NODE=32' not in text:
    raise SystemExit('D-200 bootstrap peer bound must remain 32')
if 'requiredFailureDomains' not in bootstrap_block or 'summary.minFailureDomains' not in bootstrap_block:
    raise SystemExit('host-stratified planner contract missing')

path.write_text(text)
