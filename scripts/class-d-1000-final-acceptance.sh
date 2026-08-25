#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

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

bootstrap_pattern = re.compile(
    r'export DEBIAN_FRONTEND=noninteractive\n'
    r'apt-get update -qq\n'
    r'apt-get install -y -qq git curl jq openssl ca-certificates python3 iptables >/dev/null\n'
    r'major=0;.*?\n'
    r'if \[\[.*?\n'
    r'rm -rf /opt/truyn\n'
    r'git clone .*?\n'
    r'git -C .*?\n'
    r'mv .*?\n\n'
    r'cd /opt/truqyn\n'
    r'npm install --no-audit --no-fund >/dev/null',
    re.S,
)
new_bootstrap = r'''trap 'rc=\$?; echo "TRUYN_GUEST_BOOTSTRAP_ERROR rc=\$rc line=\$LINENO cmd=\$BASH_COMMAND" >&2; exit \$rc' ERR
for required in python3 tar sha256sum systemctl iptables iptables-save readlink; do command -v "\$required" >/dev/null; done
bundle=/tmp/truyn-d1000-runtime.tgz
rm -f "\$bundle"
python3 - '${RUNTIME_URL_B64}' "\$bundle" <<'PYRUNTIME'
import base64, sys, urllib.request
url = base64.b64decode(sys.argv[1]).decode('utf-8')
urllib.request.urlretrieve(url, sys.argv[2])
PYRUNTIME
printf '%s  %s\n' '${TRUYN_CLASS_D1000_RUNTIME_SHA256}' "\$bundle" | sha256sum -c -
rm -rf /opt/truqyn
mkdir -p /opt/truqyn
tar -xzf "\$bundle" -C /opt/truqyn
test -x /opt/truqyn/runtime/bin/node
test -x /opt/truqyn/runtime/bin/jq
test -x /opt/truqyn/runtime/bin/curl
test -x /opt/truqyn/runtime/bin/openssl
/opt/truqyn/runtime/bin/node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
/opt/truqyn/runtime/bin/jq --version >/dev/null
/opt/truqyn/runtime/bin/curl --version >/dev/null
/opt/truqyn/runtime/bin/openssl version >/dev/null
ln -sfn /opt/truqyn/runtime/bin/node /usr/local/bin/node
ln -sfn /opt/truqyn/runtime/bin/jq /usr/local/bin/jq
ln -sfn /opt/truqyn/runtime/bin/curl /usr/local/bin/curl
ln -sfn /opt/truqyn/runtime/bin/openssl /usr/local/bin/openssl
cd /opt/truqyn/app'''.replace('truqyn', 'truyn')
p, bootstrap_count = bootstrap_pattern.subn(new_bootstrap, p, count=1)
if bootstrap_count != 1:
    raise SystemExit(f'expected exactly one legacy D-1000 network bootstrap, replaced={bootstrap_count}')

p = p.replace('WorkingDirectory=/opt/truqyn', 'WorkingDirectory=/opt/truqyn/app').replace('truqyn', 'truyn')
p = p.replace('ExecStart=/usr/bin/node /opt/truin/network/testnet/node-service.js', 'ExecStart=/opt/truyn/runtime/bin/node /opt/truyn/app/network/testnet/node-service.js')
p = p.replace('ExecStart=/usr/bin/node /opt/truyn/network/testnet/node-service.js', 'ExecStart=/opt/truyn/runtime/bin/node /opt/truyn/app/network/testnet/node-service.js')

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
grep -q 'EnvironmentFile=/etc/truqyn-d1000/node-%i.env' "$TMP/provision.sh" || grep -q 'EnvironmentFile=/etc/truyn-d1000/node-%i.env' "$TMP/provision.sh"
grep -q 'ExecStart=/usr/bin/node /opt/truyqn/network/testnet/node-service.js' "$TMP/provision.sh" && exit 1 || true
grep -q 'ExecStart=/usr/bin/node /opt/truqyn/network/testnet/node-service.js' "$TMP/provision.sh" && exit 1 || true
grep -q 'ExecStart=/usr/bin/node /opt/truin/network/testnet/node-service.js' "$TMP/provision.sh" && exit 1 || true
grep -q 'ExecStart=/usr/bin/node /opt/truy n/network/testnet/node-service.js' "$TMP/provision.sh" && exit 1 || true
grep -q 'ExecStart=/opt/truqyn/runtime/bin/node /opt/truqyn/app/network/testnet/node-service.js' "$TMP/provision.sh" || grep -q 'ExecStart=/opt/truyn/runtime/bin/node /opt/truyn/app/network/testnet/node-service.js' "$TMP/provision.sh"

for forbidden in 'apt-get update' 'apt-get install' 'deb.nodesource.com' 'git clone' 'npm install'; do
  if grep -Fq "$forbidden" "$TMP/provision.sh"; then
    echo "non-hermetic D-1000 guest bootstrap survived preparation: $forbidden" >&2
    exit 1
  fi
done
grep -Fq 'TRUYN_CLASS_D1000_RUNTIME_URL' "$TMP/provision.sh"
grep -Fq 'TRUYN_CLASS_D1000_RUNTIME_SHA256' "$TMP/provision.sh"
grep -Fq 'sha256sum -c -' "$TMP/provision.sh"
grep -Fq 'TRUYN_GUEST_BOOTSTRAP_ERROR rc=' "$TMP/provision.sh"
grep -Fq 'readlink' "$TMP/provision.sh"

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

echo "TRUYN_CLASS_D1000_PREPARED_HARNESS=PASS safetyContract=v2 remoteDht=target-side-quic paths=canonical runCommandBoundary=accepted-d100 runtimeBundle=sha256-pinned"

if [[ "${TRUYN_CLASS_D1000_PREPARE_ONLY:-0}" == 1 ]]; then
  rm -rf "$TMP"
  exit 0
fi

source "$TMP/provision.sh"
source "$TMP/campaign.sh"
rm -rf "$TMP"
