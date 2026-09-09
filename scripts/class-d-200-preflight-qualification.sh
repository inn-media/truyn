#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

repeats="${TRUYN_D200_QUALIFICATION_REPEATS:-5}"
[[ "$repeats" =~ ^[1-9][0-9]*$ ]]

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp benchmarks/scale/class-d-azure-1000-provision.sh "$tmp/provision.sh"
cp benchmarks/scale/class-d-azure-1000-campaign.sh "$tmp/campaign.sh"

python3 scripts/patch-class-d-diagnostic-bootstrap-timeout.py "$tmp/provision.sh"
python3 scripts/patch-class-d-diagnostic-bootstrap-parallel.py "$tmp/provision.sh"
python3 scripts/patch-class-d-diagnostic-peer-lease-freshness.py "$tmp/provision.sh"
python3 scripts/patch-class-d-diagnostic-bandwidth-meter-parallel.py "$tmp/provision.sh"
python3 scripts/patch-class-d-diagnostic-readiness-parallel.py "$tmp/campaign.sh"
python3 scripts/patch-class-d-diagnostic-readiness-window.py "$tmp/campaign.sh"
python3 scripts/patch-class-d-diagnostic-readiness-evidence.py "$tmp/campaign.sh"
python3 scripts/patch-class-d-diagnostic-readiness-transport.py "$tmp/campaign.sh"
python3 scripts/patch-class-d-diagnostic-baseline-parallel.py "$tmp/campaign.sh"
python3 scripts/patch-class-d-diagnostic-restart-parallel.py "$tmp/campaign.sh"
python3 scripts/patch-class-d-diagnostic-post-restart-origin.py "$tmp/campaign.sh"
python3 - "$tmp/campaign.sh" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text()
if s.count('seq 10 14') != 3 or s.count('range(10,15)') != 1:
    raise SystemExit('unexpected D-1000 restart range before D-200 qualification rewrite')
p.write_text(s.replace('seq 10 14','seq 5 9').replace('range(10,15)','range(5,10)'))
PY
python3 scripts/patch-class-d-diagnostic-composed-heal-evidence.py "$tmp/provision.sh" "$tmp/campaign.sh"

bash -n "$tmp/provision.sh"
bash -n "$tmp/campaign.sh"

unset NODE_TEST_CONTEXT

node --test \
  tests/class-d-1000-bootstrap.test.js \
  tests/class-d-diagnostic-peer-lease-freshness.test.js \
  tests/class-d-diagnostic-readiness-parallel.test.js \
  tests/class-d-diagnostic-readiness-window.test.js \
  tests/class-d-diagnostic-readiness-evidence.test.js \
  tests/class-d-diagnostic-readiness-transport.test.js \
  tests/class-d-diagnostic-restart-parallel.test.js \
  tests/class-d-diagnostic-post-restart-origin.test.js \
  tests/dht-readiness-testnet-endpoint.test.js \
  tests/peer-discovery-periodic-refresh.test.js \
  tests/peer-record-restart-propagation-readiness.test.js \
  tests/dht-replication-keyspace.test.js

for _ in $(seq 1 "$repeats"); do
  node --test \
    tests/class-d-diagnostic-readiness-window.test.js \
    tests/class-d-diagnostic-readiness-evidence.test.js \
    tests/class-d-diagnostic-readiness-transport.test.js \
    tests/peer-record-restart-propagation-readiness.test.js >/dev/null
done

python3 - "$tmp/provision.sh" "$tmp/campaign.sh" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]).read_text()
s=Path(sys.argv[2]).read_text()

def stage(a,b):
    i=s.index(a); j=s.index(b,i+len(a)); return s[i:j]

refresh=p[p.index('STAGE=bootstrap-record-refresh'):p.index('STAGE=bootstrap\n', p.index('STAGE=bootstrap-record-refresh')+1)]
bootstrap=p[p.index('STAGE=bootstrap\n', p.index('STAGE=bootstrap-record-refresh')+1):p.index('STAGE=bandwidth-meter')]
readiness=stage('STAGE=readiness-barrier','STAGE=convergence')
restart=stage('STAGE=restart-recovery','STAGE=post-restart-routing')
post=stage('STAGE=post-restart-routing','STAGE=packet-partition')
partition=stage('STAGE=packet-partition','STAGE=healed-routing')
healed=stage('STAGE=healed-routing','STAGE=write-retention')

assert 'TRUYN_PEER_RECORD_TTL_MS=1800000' in p
assert 'BOOTSTRAP_MAX_PEERS_PER_NODE=32' in p
assert 'BOOTSTRAP_MIN_PEER_LEASE_REMAINING_MS=900000' in p
assert '/record' in refresh
assert 'issuedAt' in refresh and 'expiresAt' in refresh
assert 'os.replace(temporary, final)' in refresh
assert '/need' not in refresh
assert 'TRUYN_BOOTSTRAP_REQUIRED_FAILURE_DOMAINS=${HOST_COUNT}' in bootstrap
assert 'summary.minFailureDomains !== requiredFailureDomains' in bootstrap
assert 'BOOTSTRAP_PLAN_MIN_FAILURE_DOMAINS' in bootstrap
assert 'BOOTSTRAP_PLAN_MAX_FAILURE_DOMAINS' in bootstrap
assert 'plan=host-stratified-xor' in bootstrap
assert '/need' not in bootstrap

assert readiness.count('deadline=\\$((\\$(date +%s) + 120))') == 1
assert '/need' not in readiness
assert 'D200_READINESS_WINDOW_HARDENED=1' in readiness
assert 'D200_READINESS_EVIDENCE_V2=1' in readiness
assert 'D200_READINESS_TRANSPORT_GZIP_V1=1' in readiness
assert 'gzip -c -9 | base64 -w0' in readiness
assert 'base64 -d | gzip -dc | jq -e' in readiness
assert '"\\${#readiness_node_observations_b64}" -le 3000' in readiness
assert 'readiness_remaining=\\$((deadline - readiness_now))' in readiness
assert 'if readiness=\\$(curl -fsS --max-time "\\$readiness_probe_timeout"' in readiness
assert '"\\$hosts" -eq ${HOST_COUNT}' in readiness
assert '"\\$valid" -ge ${BOOTSTRAP_MAX_PEERS_PER_NODE}' in readiness
assert '.acceptanceReady == true and .peerRecordPropagation.ready == true' in readiness
assert 'READINESS_NODE_OBSERVATIONS_B64' in readiness
assert 'missingHostIndexes' in readiness
assert 'oldestPeerRecordIssuedAt' in readiness
assert 'nearestPeerRecordExpiryMs' in readiness
assert 'expiredPeerRecords' in readiness
assert 'peerRecordSequence' in readiness
assert 'periodicRefreshLastResult' in readiness
assert 'class-d-200-readiness-node-observations.json' in readiness
assert 'TRUYN_D200_READINESS_AGGREGATE_FAILURE' in readiness
assert 'rm -rf "$readiness_dir"\n    false' not in readiness

assert 'seq 10 14' not in s
assert 'range(10,15)' not in s
assert 'seq 5 9' in restart
assert 'range(5,10)' in post
assert '/dht/readiness' in restart
assert 'peerRecordPropagation.ready == true' in restart
assert 'pending' in restart
assert "assert float('$recovery_p95') <= 120000" in restart

assert 'acceptanceUsesFirstAttemptOnly' in post
assert "'applicationRetryCount':0" in post
assert "assert float('$post_rate') >= .99" in post

assert 'blockedSuccesses' in s or 'PARTITION_SUCCESSES' in partition
assert 'partition_recovery_ms' in partition
assert '120000' in partition
assert "assert float('$healed_rate') >= .99" in healed

assert "assert float('$base_rate') >= .99" in s
assert "assert float('$conv_rate') >= .99" in s
assert "assert float('$conv_p95') <= 120000" in s
assert 'invalidSignedStateAccepted' in s
assert 'unauthorizedProviderExecution' in s
assert 'acknowledgedWriteLoss' in s
print('TRUYN_D200_PREFLIGHT_QUALIFICATION=PASS')
PY