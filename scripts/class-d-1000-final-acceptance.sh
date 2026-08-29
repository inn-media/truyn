#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STRICT_D1000_NODES_PER_HOST=50
export TRUYN_CLASS_D1000_NODES_PER_HOST="$STRICT_D1000_NODES_PER_HOST"

source "$ROOT/scripts/lib/class-d-run-command.sh"

TMP="$(mktemp -d)"
cp benchmarks/scale/class-d-azure-1000-provision.sh "$TMP/provision.sh"
cp benchmarks/scale/class-d-azure-1000-campaign.sh "$TMP/campaign.sh"

python3 - "$TMP/provision.sh" "$TMP/campaign.sh" <<'PY'
from pathlib import Path
import re
import sys

provision = Path(sys.argv[1])
campaign = Path(sys.argv[2])

def canonical(text: str) -> str:
    for bad, good in (
        ('truy n', 'truyn'),
        ('truin-d1000', 'truyn-d1000'),
        ('truqyn', 'truyn'),
        ('truyqn', 'truyn'),
        ('/opt/truin', '/opt/truyn'),
    ):
        text = text.replace(bad, good)
    return text

p = canonical(provision.read_text())

runtime_anchor = 'START_MS=$(date +%s%3N)\n'
runtime_init = ''': "${TRUYN_CLASS_D1000_RUNTIME_URL:?TRUYN_CLASS_D1000_RUNTIME_URL is required}"\n: "${TRUYN_CLASS_D1000_RUNTIME_SHA256:?TRUYN_CLASS_D1000_RUNTIME_SHA256 is required}"\nRUNTIME_URL_B64="$(printf '%s' "$TRUYN_CLASS_D1000_RUNTIME_URL" | base64 -w0)"\n'''
if p.count(runtime_anchor) != 1:
    raise SystemExit(f'expected one D-1000 runtime anchor, found={p.count(runtime_anchor)}')
p = p.replace(runtime_anchor, runtime_anchor + runtime_init, 1)

remote_pattern = r'\nremote\(\) \{\n.*?\n\}\n\nmarker\(\)'
remote_replacement = '''
remote() {
  local vm="$1" body="$2"
  truyn_class_d_remote "$RG" "$vm" "$body"
}

marker()'''
p, remote_count = re.subn(remote_pattern, remote_replacement, p, count=1, flags=re.S)
if remote_count != 1:
    raise SystemExit(f'expected exactly one D-1000 remote wrapper, replaced={remote_count}')

marker_anchor = '''marker() {
  local text="$1" key="$2"
  printf '%s\\n' "$text" | sed -n "s/.*${key}=//p" | tail -1 | tr -d '\\r'
}
'''
failure_helpers = r'''
finalize_failure_evidence() {
  local rc="${1:-1}" failed_stage="${2:-unknown}" failed_line="${3:-0}" now_ms
  set +e
  if [[ -f "$EVIDENCE" ]]; then
    return 0
  fi
  now_ms=$(date +%s%3N 2>/dev/null || date +%s000)
  TRUYN_FAIL_RC="$rc" \
  TRUYN_FAIL_STAGE="$failed_stage" \
  TRUYN_FAIL_LINE="$failed_line" \
  TRUYN_FAIL_END_MS="$now_ms" \
  TRUYN_START_MS="${START_MS:-}" \
  TRUYN_TESTED_COMMIT="${GITHUB_SHA:-}" \
  TRUYN_WORKFLOW_RUN_ID="${GITHUB_RUN_ID:-}" \
  TRUYN_NODE_COUNT="${NODE_COUNT:-}" \
  TRUYN_HOST_COUNT="${HOST_COUNT:-}" \
  TRUYN_NODES_PER_HOST="${NODES_PER_HOST:-}" \
  TRUYN_CONV_RATE="${conv_rate:-}" \
  TRUYN_CONV_TOTAL="${conv_total:-}" \
  TRUYN_CONV_P95="${conv_p95:-}" \
  TRUYN_CONV_P99="${conv_p99:-}" \
  TRUYN_CONV_MS="${conv_ms:-}" \
  python3 - "$EVIDENCE" <<'PYFAIL'
import json
import math
import os
import sys

path = sys.argv[1]

def number(name):
    value = os.environ.get(name, '').strip()
    if not value:
        return None
    try:
        parsed = float(value)
    except ValueError:
        return None
    if not math.isfinite(parsed):
        return None
    return int(parsed) if parsed.is_integer() else parsed

def integer(name, fallback=None):
    parsed = number(name)
    return fallback if parsed is None else int(parsed)

start_ms = number('TRUYN_START_MS')
end_ms = number('TRUYN_FAIL_END_MS')
campaign_ms = None
if start_ms is not None and end_ms is not None:
    campaign_ms = max(0, int(end_ms - start_ms))

host_count = integer('TRUYN_HOST_COUNT')
node_count = integer('TRUYN_NODE_COUNT')
nodes_per_host = integer('TRUYN_NODES_PER_HOST')

evidence = {
    "class": "D-1000",
    "status": "FAIL",
    "scope": "1000-real-process-scale+safety-contract-v2",
    "testedCommit": os.environ.get('TRUYN_TESTED_COMMIT', ''),
    "workflowRunId": os.environ.get('TRUYN_WORKFLOW_RUN_ID', ''),
    "failure": {
        "stage": os.environ.get('TRUYN_FAIL_STAGE', 'unknown'),
        "exitCode": integer('TRUYN_FAIL_RC', 1),
        "line": integer('TRUYN_FAIL_LINE', 0),
        "evidenceFinalizedOnFail": True
    },
    "topology": {
        "nodeCount": node_count,
        "realProcessCount": node_count,
        "hostCount": host_count,
        "realProcessesPerHost": nodes_per_host,
        "syntheticNodeCount": 0
    },
    "convergence": {
        "probeMode": "parallel-host-fanout",
        "hostCount": host_count,
        "aggregation": "max-of-host-quantiles",
        "aggregateMs": number('TRUYN_CONV_MS'),
        "latencyMs": {
            "p95": number('TRUYN_CONV_P95'),
            "p99": number('TRUYN_CONV_P99')
        },
        "routingSuccessRatio": number('TRUYN_CONV_RATE'),
        "nodeProbeCount": number('TRUYN_CONV_TOTAL')
    },
    "timing": {"campaignMs": campaign_ms},
    "cleanup": {
        "confirmed": False,
        "remainingResources": None,
        "finalizedByExitTrap": True
    }
}

tmp = f'{path}.tmp'
with open(tmp, 'w', encoding='utf-8') as handle:
    json.dump(evidence, handle, separators=(',', ':'))
    handle.write('\n')
os.replace(tmp, path)
PYFAIL
  echo "TRUYN_CLASS_D_1000_FAIL_EVIDENCE finalized=true stage=${failed_stage} exit=${rc} path=${EVIDENCE}"
}
'''
if p.count(marker_anchor) != 1:
    raise SystemExit(f'expected exactly one D-1000 marker helper, found={p.count(marker_anchor)}')
p = p.replace(marker_anchor, marker_anchor + failure_helpers, 1)

cleanup_old = '''jq --argjson confirmed "$CLEANUP_CONFIRMED" --argjson remaining "$left" '.cleanup.confirmed=$confirmed | .cleanup.remainingResources=$remaining' "$EVIDENCE" >"$tmp" && mv "$tmp" "$EVIDENCE"'''
cleanup_new = '''jq --argjson confirmed "$CLEANUP_CONFIRMED" --argjson remaining "$left" --argjson after_exit_trap true '.cleanup.confirmed=$confirmed | .cleanup.remainingResources=$remaining | .cleanup.finalizedAfterExitTrap=$after_exit_trap' "$EVIDENCE" >"$tmp" && mv "$tmp" "$EVIDENCE"'''
if p.count(cleanup_old) != 1:
    raise SystemExit(f'expected exactly one D-1000 cleanup evidence patch, found={p.count(cleanup_old)}')
p = p.replace(cleanup_old, cleanup_new, 1)

trap_old = '''trap 'rc=$?; echo "::error title=TRUYN Class D-1000 failure::stage=$STAGE exit=$rc line=$LINENO"; exit $rc' ERR'''
trap_new = '''trap 'rc=$?; failed_stage="$STAGE"; failed_line="$LINENO"; echo "::error title=TRUYN Class D-1000 failure::stage=$failed_stage exit=$rc line=$failed_line"; finalize_failure_evidence "$rc" "$failed_stage" "$failed_line"; exit "$rc"' ERR'''
if p.count(trap_old) != 1:
    raise SystemExit(f'expected exactly one D-1000 ERR trap, found={p.count(trap_old)}')
p = p.replace(trap_old, trap_new, 1)

bootstrap_pattern = re.compile(
    r'export DEBIAN_FRONTEND=noninteractive\n'
    r'install_stage=apt-update\n'
    r'.*?'
    r'install_stage=runtime-config\n',
    re.S,
)
new_bootstrap = r'''install_stage=runtime-prereqs
for required in python3 tar sha256sum systemctl iptables iptables-save; do command -v "\$required" >/dev/null; done
install_stage=runtime-download
bundle=/tmp/truyn-d1000-runtime.tgz
rm -f "\$bundle"
python3 - '${RUNTIME_URL_B64}' "\$bundle" <<'PYRUNTIME'
import base64, sys, urllib.request
url = base64.b64decode(sys.argv[1]).decode('utf-8')
urllib.request.urlretrieve(url, sys.argv[2])
PYRUNTIME
install_stage=runtime-digest
printf '%s  %s\n' '${TRUYN_CLASS_D1000_RUNTIME_SHA256}' "\$bundle" | sha256sum -c -
install_stage=runtime-extract
rm -rf /opt/truyn
mkdir -p /opt/truyn
tar -xzf "\$bundle" -C /opt/truin
test -x /opt/truyn/runtime/bin/node
test -x /opt/truin/runtime/bin/jq
test -x /opt/truin/runtime/bin/curl
test -x /opt/truin/runtime/bin/openssl
/opt/truyn/runtime/bin/node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
/opt/truin/runtime/bin/jq --version >/dev/null
/opt/truy n/runtime/bin/curl --version >/dev/null
/opt/truy n/runtime/bin/openssl version >/dev/null
ln -sfn /opt/truy n/runtime/bin/node /usr/local/bin/node
ln -sfn /opt/truy n/runtime/bin/jq /usr/local/bin/jq
ln -sfn /opt/truy n/runtime/bin/curl /usr/local/bin/curl
ln -sfn /opt/truy n/runtime/bin/openssl /usr/local/bin/openssl
cd /opt/truy n/app
install_stage=quic-import
/opt/truy n/runtime/bin/node --input-type=module -e "await import('@chainsafe/libp2p-quic'); await import('@matrixai/quic'); console.log('QUIC_IMPORT=PASS')"
install_stage=runtime-config'''.replace('truin', 'truyn').replace('truy n', 'truyn')
p, bootstrap_count = bootstrap_pattern.subn(new_bootstrap, p, count=1)
if bootstrap_count != 1:
    raise SystemExit(f'expected exactly one exact-SHA D-1000 network bootstrap, replaced={bootstrap_count}')

p = p.replace('WorkingDirectory=/opt/truyn', 'WorkingDirectory=/opt/truyn/app')
p = p.replace('ExecStart=/usr/bin/node /opt/truin/network/testnet/node-service.js', 'ExecStart=/opt/truyn/runtime/bin/node /opt/truin/app/network/testnet/node-service.js')
p = p.replace('ExecStart=/usr/bin/node /opt/truy n/network/testnet/node-service.js', 'ExecStart=/opt/truy n/runtime/bin/node /opt/truy n/app/network/testnet/node-service.js')
p = p.replace('truin', 'truyn').replace('truy n', 'truyn')

ready_old = '''  out=$(remote "${VMS[$i]}" "$script")
  [[ "$(marker "$out" READY)" == "$NODES_PER_HOST" ]]'''
ready_new = '''  out=$(remote "${VMS[$i]}" "$script")
  if [[ "$(marker "$out" READY)" != "$NODES_PER_HOST" ]]; then
    printf '%s\\n' "$out" >&2
    echo "TRUYN_CLASS_D_1000 install host=$i missing_ready expected=$NODES_PER_HOST" >&2
    false
  fi'''
if p.count(ready_old) != 1:
    raise SystemExit(f'expected exactly one D-1000 READY assertion, found={p.count(ready_old)}')
p = p.replace(ready_old, ready_new, 1)

p = p.replace('TRUYN_PEER_RECORD_TTL_MS=1800000', 'TRUYN_PEER_RECORD_TTL_MS=14400000')
c = canonical(campaign.read_text())

for name, text in (('provision', p), ('campaign', c)):
    for forbidden in ('truy n', 'truin-d1000', 'truqyn', 'truyqn', '/opt/truin'):
        if forbidden in text:
            raise SystemExit(f'noncanonical D-1000 prepared token survived in {name}: {forbidden}')

provision.write_text(p)
campaign.write_text(c)
PY

bash -n "$TMP/provision.sh"
bash -n "$TMP/campaign.sh"
bash -n scripts/class-d-1000-strict-acceptance.sh
bash -n scripts/lib/class-d-run-command.sh
node --check benchmarks/scale/class-d-1000-safety-probes.js
node --check benchmarks/scale/class-d-1000-remote-dht-probe.js
node --check benchmarks/scale/class-d-1000-evidence.js
node --check benchmarks/scale/evaluate-class-d-1000-evidence.js
node --check benchmarks/scale/verify-class-d-1000-terminal.js

grep -q 'STAGE=invalid-signed-state' "$TMP/campaign.sh"
grep -q 'class-d-1000-remote-dht-probe.js' "$TMP/campaign.sh"
grep -q 'remoteQuicControl' "$TMP/campaign.sh"
grep -q 'invalid_dht_record:dht_record_signature' "$TMP/campaign.sh"
grep -q 'class-d-1000-safety-probes.js' "$TMP/campaign.sh"
grep -q 'STAGE=packet-partition' "$TMP/campaign.sh"
grep -q 'STAGE=healed-routing' "$TMP/campaign.sh"
grep -q '"healedSuccessRatio":${healed_rate}' "$TMP/campaign.sh"
grep -q '"invalidSignedStateAcceptedCount":${invalid_signed_state_accepted}' "$TMP/campaign.sh"
grep -q '"staleRevokedReceiptAcceptedCount":${stale_receipt_accepted}' "$TMP/campaign.sh"
grep -q '"unauthorizedProviderExecutionCount":${unauthorized_provider_execution}' "$TMP/campaign.sh"
grep -q '"realPacketPath":true' "$TMP/campaign.sh"
grep -q '/bin/bash /tmp/truqyn-d1000-run.sh' "$TMP/provision.sh" && exit 1 || true
grep -q '/bin/bash /tmp/truyqn-d1000-run.sh' "$TMP/provision.sh" && exit 1 || true
grep -q '/bin/bash /tmp/truin-d1000-run.sh' "$TMP/provision.sh" && exit 1 || true
grep -q '/bin/bash /tmp/truy n-d1000-run.sh' "$TMP/provision.sh" && exit 1 || true
grep -q 'WorkingDirectory=/opt/truyn/app' "$TMP/provision.sh"
grep -q 'EnvironmentFile=/etc/truqyn-d1000/node-%i.env' "$TMP/provision.sh" && exit 1 || true
grep -q 'EnvironmentFile=/etc/truyqn-d1000/node-%i.env' "$TMP/provision.sh" && exit 1 || true
grep -q 'EnvironmentFile=/etc/truin-d1000/node-%i.env' "$TMP/provision.sh" && exit 1 || true
grep -q 'EnvironmentFile=/etc/truy n-d1000/node-%i.env' "$TMP/provision.sh" && exit 1 || true
grep -q 'EnvironmentFile=/etc/truyn-d1000/node-%i.env' "$TMP/provision.sh"
grep -q 'ExecStart=/usr/bin/node /opt/truyqn/network/testnet/node-service.js' "$TMP/provision.sh" && exit 1 || true
grep -q 'ExecStart=/usr/bin/node /opt/truqyn/network/testnet/node-service.js' "$TMP/provision.sh" && exit 1 || true
grep -q 'ExecStart=/usr/bin/node /opt/truin/network/testnet/node-service.js' "$TMP/provision.sh" && exit 1 || true
grep -q 'ExecStart=/usr/bin/node /opt/truy n/network/testnet/node-service.js' "$TMP/provision.sh" && exit 1 || true
grep -q 'ExecStart=/opt/truyn/runtime/bin/node /opt/truin/app/network/testnet/node-service.js' "$TMP/provision.sh" && exit 1 || true
grep -q 'ExecStart=/opt/truy n/runtime/bin/node /opt/truy n/app/network/testnet/node-service.js' "$TMP/provision.sh" && exit 1 || true
grep -q 'ExecStart=/opt/truqyn/runtime/bin/node /opt/truqyn/app/network/testnet/node-service.js' "$TMP/provision.sh" && exit 1 || true
grep -q 'ExecStart=/opt/truyqn/runtime/bin/node /opt/truyqn/app/network/testnet/node-service.js' "$TMP/provision.sh" && exit 1 || true
grep -q 'ExecStart=/opt/truyn/runtime/bin/node /opt/truyn/app/network/testnet/node-service.js' "$TMP/provision.sh"

for forbidden in 'apt-get update' 'apt-get install' 'deb.nodesource.com' 'git clone' 'npm install'; do
  if grep -Fq "$forbidden" "$TMP/provision.sh"; then
    echo "non-hermetic D-1000 guest bootstrap survived preparation: $forbidden" >&2
    exit 1
  fi
done
grep -Fq 'TRUYN_CLASS_D1000_RUNTIME_URL' "$TMP/provision.sh"
grep -Fq 'TRUYN_CLASS_D1000_RUNTIME_SHA256' "$TMP/provision.sh"
grep -Fq 'sha256sum -c -' "$TMP/provision.sh"
grep -Fq 'STRICT_NODES_PER_HOST=50' "$TMP/provision.sh"
grep -Fq 'DIAGNOSTIC_NODES_PER_HOST_SIZES="10 25 50"' "$TMP/provision.sh"
grep -Fq 'NODES_PER_HOST="${TRUYN_CLASS_D1000_NODES_PER_HOST:-$STRICT_NODES_PER_HOST}"' "$TMP/provision.sh"
grep -Fq 'NODE_COUNT=$((HOST_COUNT * NODES_PER_HOST))' "$TMP/provision.sh"
[[ "$TRUYN_CLASS_D1000_NODES_PER_HOST" == "50" ]]

grep -Fq 'truyn_class_d_remote "$RG" "$vm" "$body"' "$TMP/provision.sh"
if grep -Fq -- "--query 'value[0].message'" "$TMP/provision.sh"; then
  echo 'legacy D-1000 value[0].message RunCommand boundary survived preparation' >&2
  exit 1
fi
if grep -Fq 'retry az vm run-command invoke' "$TMP/provision.sh"; then
  echo 'legacy D-1000 whole-guest RunCommand retry survived preparation' >&2
  exit 1
fi
grep -Fq -- "--query 'value[].message'" scripts/lib/class-d-run-command.sh
grep -Fq 'TRUYN_GUEST_EXECUTION_ADMITTED=1' scripts/lib/class-d-run-command.sh
grep -Fq 'missing_ready expected=$NODES_PER_HOST' "$TMP/provision.sh"
grep -Fq 'finalize_failure_evidence()' "$TMP/provision.sh"
grep -Fq 'finalize_failure_evidence "$rc" "$failed_stage" "$failed_line"' "$TMP/provision.sh"
grep -Fq 'TRUYN_CLASS_D_1000_FAIL_EVIDENCE finalized=true' "$TMP/provision.sh"
grep -Fq 'TRUYN_CONV_RATE="${conv_rate:-}"' "$TMP/provision.sh"
grep -Fq '"status": "FAIL"' "$TMP/provision.sh"
grep -Fq '"evidenceFinalizedOnFail": True' "$TMP/provision.sh"
grep -Fq '.cleanup.finalizedAfterExitTrap=$after_exit_trap' "$TMP/provision.sh"

echo "TRUYN_CLASS_D1000_PREPARED_HARNESS=PASS safetyContract=v2 remoteDht=target-side-quic paths=canonical runCommandBoundary=accepted-d100 runtimeBundle=sha256-pinned strictNodesPerHost=${TRUYN_CLASS_D1000_NODES_PER_HOST}"

if [[ "${TRUYN_CLASS_D1000_PREPARE_ONLY:-0}" == 1 ]]; then
  rm -rf "$TMP"
  exit 0
fi

source "$TMP/provision.sh"
source "$TMP/campaign.sh"
rm -rf "$TMP"