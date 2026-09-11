#!/usr/bin/env bash
set -Eeuo pipefail

: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"

LOCATION="${TRUYN_CLASS_D1000_LOCATION:-eastus2}"
VM_SIZE="${TRUYN_CLASS_D1000_VM_SIZE:-Standard_D4as_v5}"
RG="${TRUYN_AZURE_RESOURCE_GROUP:-truyn}"
PREFIX="truyn-d1000-${GITHUB_RUN_ID}"
VNET="${PREFIX}-vnet"
SUBNET="${PREFIX}-subnet"
NSG="${PREFIX}-nsg"
HOST_COUNT=20
STRICT_NODES_PER_HOST=50
DIAGNOSTIC_NODES_PER_HOST_SIZES="10 25 50"
NODES_PER_HOST="${TRUYN_CLASS_D1000_NODES_PER_HOST:-$STRICT_NODES_PER_HOST}"
case " ${DIAGNOSTIC_NODES_PER_HOST_SIZES} " in
  *" ${NODES_PER_HOST} "*) ;;
  *) echo "TRUYN_CLASS_D_1000 invalid diagnostic NODES_PER_HOST=${NODES_PER_HOST}; allowed=10/25/50" >&2; exit 1 ;;
esac
NODE_COUNT=$((HOST_COUNT * NODES_PER_HOST))
BOOTSTRAP_MAX_PEERS_PER_NODE=32
BOOTSTRAP_PEERS_PER_BUCKET=2
BOOTSTRAP_MIN_PEER_LEASE_REMAINING_MS=900000
QUIC_BASE=4400
CONTROL_BASE=8700
EVIDENCE="${GITHUB_WORKSPACE:-$PWD}/class-d-1000-evidence.json"
START_MS=$(date +%s%3N)
: "${TRUYN_CLASS_D1000_RUNTIME_URL:?TRUYN_CLASS_D1000_RUNTIME_URL is required}"
: "${TRUYN_CLASS_D1000_RUNTIME_SHA256:?TRUYN_CLASS_D1000_RUNTIME_SHA256 is required}"
RUNTIME_URL_B64="$(printf '%s' "$TRUYN_CLASS_D1000_RUNTIME_URL" | base64 -w0)"
CLEANUP_CONFIRMED=false
STAGE=init

VMS=(); NICS=(); DISKS=(); PRIV=()
for i in $(seq 0 $((HOST_COUNT-1))); do
  VMS+=("${PREFIX}-h${i}")
  NICS+=("${PREFIX}-h${i}-nic")
  DISKS+=("${PREFIX}-h${i}-os")
done

retry() {
  local n=0
  until "$@"; do n=$((n+1)); [[ $n -lt 5 ]] || return 1; sleep $((n*3)); done
}

remote() {
  local vm="$1" body="$2" enc remote_script output rc attempt
  enc="$(printf '%s' "$body" | base64 -w0)"
  remote_script="printf '%s' '$enc' | base64 -d >/tmp/truyn-d1000-run.sh; chmod 700 /tmp/truyn-d1000-run.sh; /bin/bash /tmp/truyn-d1000-run.sh"
  remote_script="${remote_script//truyn/truyn}"
  remote_script="${remote_script//truyn/truyn}"
  for attempt in 1 2 3 4 5; do
    set +e
    output=$(az vm run-command invoke -g "$RG" -n "$vm" --command-id RunShellScript --scripts "$remote_script" --query 'value[0].message' -o tsv --only-show-errors 2>&1)
    rc=$?
    set -e
    printf '%s\n' "$output" >&2
    if [[ $rc -eq 0 ]]; then
      printf '%s\n' "$output"
      return 0
    fi
    echo "TRUYN_REMOTE_RETRY vm=${vm} attempt=${attempt} rc=${rc}" >&2
    [[ $attempt -lt 5 ]] || break
    sleep $((attempt*3))
  done
  echo "TRUYN_REMOTE_FAILURE vm=${vm} attempts=5 rc=${rc}" >&2
  return "$rc"
}

marker() {
  local text="$1" key="$2"
  printf '%s\n' "$text" | sed -n "s/.*${key}=//p" | tail -1 | tr -d '\r'
}

d200_failure_evidence_checkpoint() {
  local prior_rc="${1:-1}" failed_stage="${2:-unknown}" failed_line="${3:-0}" tmp
  trap - ERR
  set +e
  if [[ -s "$EVIDENCE" ]] && jq -e '.failure != null' "$EVIDENCE" >/dev/null 2>&1; then
    echo "TRUYN_D200_FAILURE_EVIDENCE=RETAINED stage=${failed_stage} exit=${prior_rc} line=${failed_line}"
    return 0
  fi
  tmp="${EVIDENCE}.d200-failure.tmp"
  D200_EVIDENCE="$tmp" \
  D200_TESTED_COMMIT="${GITHUB_SHA:-}" D200_WORKFLOW_RUN_ID="${GITHUB_RUN_ID:-}" \
  D200_FAILURE_STAGE="$failed_stage" D200_FAILURE_EXIT="$prior_rc" D200_FAILURE_LINE="$failed_line" \
  D200_NODE_COUNT="${NODE_COUNT:-}" D200_HOST_COUNT="${HOST_COUNT:-}" D200_NODES_PER_HOST="${NODES_PER_HOST:-}" \
  D200_READINESS_READY="${readiness_ready:-}" D200_READINESS_MS="${readiness_ms:-}" \
  D200_READINESS_MIN_VALID="${readiness_min_valid:-}" D200_READINESS_MAX_VALID="${readiness_max_valid:-}" \
  D200_READINESS_MIN_BUCKETS="${readiness_min_buckets:-}" D200_READINESS_MAX_BUCKETS="${readiness_max_buckets:-}" \
  D200_READINESS_MIN_HOSTS="${readiness_min_hosts:-}" D200_READINESS_MAX_HOSTS="${readiness_max_hosts:-}" \
  D200_BASE_RATE="${base_rate:-}" D200_BASE_TOTAL="${base_total:-}" D200_BASE_P50="${base_p50:-}" D200_BASE_P90="${base_p90:-}" D200_BASE_P95="${base_p95:-}" D200_BASE_P99="${base_p99:-}" \
  D200_POST_RATE="${post_rate:-}" D200_POST_TOTAL="${post_total:-}" \
  D200_HEALED_RATE="${healed_rate:-}" D200_HEALED_TOTAL="${healed_total:-}" D200_HEALED_P50="${healed_p50:-}" D200_HEALED_P90="${healed_p90:-}" D200_HEALED_P95="${healed_p95:-}" D200_HEALED_P99="${healed_p99:-}" \
  D200_CONV_RATE="${conv_rate:-}" D200_CONV_TOTAL="${conv_total:-}" D200_CONV_P95="${conv_p95:-}" D200_CONV_P99="${conv_p99:-}" D200_CONV_MS="${conv_ms:-}" \
  D200_RECOVERY_P95="${recovery_p95:-}" D200_PARTITION_RECOVERY_MS="${partition_recovery_ms:-}" D200_PARTITION_SUCCESSES="${partition_successes:-}" D200_PARTITION_PROBES="${partition_probes:-}" \
  D200_WRITES="${writes:-}" D200_ACK_LOSS="${ack_loss:-}" D200_INVALID_SIGNED_ACCEPTED="${invalid_signed_state_accepted:-}" D200_STALE_RECEIPT_ACCEPTED="${stale_receipt_accepted:-}" D200_UNAUTHORIZED_EXECUTION="${unauthorized_provider_execution:-}" \
  D200_RSS_KB="${rss_kb:-}" D200_QUIC_BYTES="${quic_bytes:-}" D200_PROCESS_TOTAL="${process_total:-}" \
  python3 - <<'PYD200EVIDENCE'
import json, os


def number(name):
    raw = os.environ.get(name, '').strip()
    if not raw or raw.lower() in {'null', 'none', 'nan'}:
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    if not (value == value and value not in (float('inf'), float('-inf'))):
        return None
    return int(value) if value.is_integer() else value


def text(name):
    value = os.environ.get(name, '').strip()
    return value or None

node_count = number('D200_NODE_COUNT')
host_count = number('D200_HOST_COUNT')
nodes_per_host = number('D200_NODES_PER_HOST')
ready = number('D200_READINESS_READY')
ready_ratio = (ready / node_count) if ready is not None and node_count not in (None, 0) else None

value = {
    'class': 'D-1000',
    'scope': '1000-real-process-scale+safety-contract-v2',
    'testedCommit': text('D200_TESTED_COMMIT'),
    'workflowRunId': text('D200_WORKFLOW_RUN_ID'),
    'topology': {
        'nodeCount': node_count,
        'realProcessCount': node_count,
        'hostCount': host_count,
        'realProcessesPerHost': nodes_per_host,
        'uniqueIdentityCount': node_count,
        'uniqueEndpointCount': node_count,
        'syntheticNodeCount': 0 if node_count is not None else None,
    },
    'readiness': {
        'readyNodeCount': ready,
        'readyNodeRatio': ready_ratio,
        'barrierMs': number('D200_READINESS_MS'),
        'validPeers': {'min': number('D200_READINESS_MIN_VALID'), 'max': number('D200_READINESS_MAX_VALID')},
        'populatedBuckets': {'min': number('D200_READINESS_MIN_BUCKETS'), 'max': number('D200_READINESS_MAX_BUCKETS')},
        'remoteEndpointHosts': {'min': number('D200_READINESS_MIN_HOSTS'), 'max': number('D200_READINESS_MAX_HOSTS')},
    },
    'routing': {
        'baselineSuccessRatio': number('D200_BASE_RATE'),
        'baselineProbes': number('D200_BASE_TOTAL'),
        'postRestartSuccessRatio': number('D200_POST_RATE'),
        'postRestartProbes': number('D200_POST_TOTAL'),
        'healedSuccessRatio': number('D200_HEALED_RATE'),
        'healedProbes': number('D200_HEALED_TOTAL'),
        'latencyMs': {
            'aggregation': 'max-of-host-quantiles',
            'p50': number('D200_BASE_P50'), 'p90': number('D200_BASE_P90'),
            'p95': number('D200_BASE_P95'), 'p99': number('D200_BASE_P99'),
        },
        'healedLatencyMs': {
            'aggregation': 'max-of-host-quantiles',
            'p50': number('D200_HEALED_P50'), 'p90': number('D200_HEALED_P90'),
            'p95': number('D200_HEALED_P95'), 'p99': number('D200_HEALED_P99'),
        },
    },
    'convergence': {
        'probeMode': 'parallel-host-fanout',
        'hostCount': host_count,
        'aggregation': 'max-of-host-quantiles',
        'aggregateMs': number('D200_CONV_MS'),
        'latencyMs': {'p95': number('D200_CONV_P95'), 'p99': number('D200_CONV_P99')},
        'routingSuccessRatio': number('D200_CONV_RATE'),
        'nodeProbeCount': number('D200_CONV_TOTAL'),
    },
    'recovery': {
        'latencyMs': {'p95': number('D200_RECOVERY_P95')},
        'restartedNodeCount': 100 if number('D200_RECOVERY_P95') is not None else None,
        'identityAndStatePathsPreserved': True if number('D200_RECOVERY_P95') is not None else None,
        'packetPartitionRecoveryMs': number('D200_PARTITION_RECOVERY_MS'),
    },
    'adversarial': {
        'packetPartition': {
            'exercised': number('D200_PARTITION_PROBES') is not None,
            'realPacketPath': True if number('D200_PARTITION_PROBES') is not None else None,
            'blockedSuccesses': number('D200_PARTITION_SUCCESSES'),
            'probeCount': number('D200_PARTITION_PROBES'),
            'recoveryMs': number('D200_PARTITION_RECOVERY_MS'),
        },
    },
    'safety': {
        'acknowledgedWriteCount': number('D200_WRITES'),
        'acknowledgedWriteLossCount': number('D200_ACK_LOSS'),
        'invalidSignedStateAcceptedCount': number('D200_INVALID_SIGNED_ACCEPTED'),
        'staleRevokedReceiptAcceptedCount': number('D200_STALE_RECEIPT_ACCEPTED'),
        'unauthorizedProviderExecutionCount': number('D200_UNAUTHORIZED_EXECUTION'),
    },
    'resources': {
        'aggregateNodeRssKb': number('D200_RSS_KB'),
        'measuredQuicUdpBytes': number('D200_QUIC_BYTES'),
        'observedNodeProcesses': number('D200_PROCESS_TOTAL'),
    },
    'failure': {
        'stage': text('D200_FAILURE_STAGE') or 'unknown',
        'exitCode': number('D200_FAILURE_EXIT'),
        'line': number('D200_FAILURE_LINE'),
        'evidenceComplete': False,
    },
    'cleanup': {'confirmed': False, 'remainingResources': None, 'finalizedByExitTrap': True},
}
with open(os.environ['D200_EVIDENCE'], 'w', encoding='utf-8') as handle:
    json.dump(value, handle, separators=(',', ':'))
    handle.write('\n')
PYD200EVIDENCE
  if [[ -s "$tmp" ]]; then
    mv "$tmp" "$EVIDENCE"
    echo "TRUYN_D200_FAILURE_EVIDENCE=CHECKPOINT stage=${failed_stage} exit=${prior_rc} line=${failed_line}"
  else
    rm -f "$tmp"
  fi
  set -e
}

d200_err_trap() {
  local rc="${1:-1}" failed_stage="${2:-unknown}" failed_line="${3:-0}"
  trap - ERR
  d200_failure_evidence_checkpoint "$rc" "$failed_stage" "$failed_line" || true
  echo "::error title=TRUYN Class D-1000 failure::stage=${failed_stage} exit=${rc} line=${failed_line}"
  exit "$rc"
}

cleanup() {
  local prior_rc=$? list_output list_rc left tmp
  set +e
  STAGE=cleanup
  CLEANUP_CONFIRMED=false
  for vm in "${VMS[@]}"; do az vm delete -g "$RG" -n "$vm" --yes --force-deletion --only-show-errors >/dev/null 2>&1 || echo "TRUYN_CLASS_D_1000_CLEANUP_DELETE_FAILURE type=vm name=${vm}" >&2; done
  for nic in "${NICS[@]}"; do az network nic delete -g "$RG" -n "$nic" --only-show-errors >/dev/null 2>&1 || echo "TRUYN_CLASS_D_1000_CLEANUP_DELETE_FAILURE type=nic name=${nic}" >&2; done
  for disk in "${DISKS[@]}"; do az disk delete -g "$RG" -n "$disk" --yes --only-show-errors >/dev/null 2>&1 || echo "TRUYN_CLASS_D_1000_CLEANUP_DELETE_FAILURE type=disk name=${disk}" >&2; done
  az network vnet delete -g "$RG" -n "$VNET" --only-show-errors >/dev/null 2>&1 || echo "TRUYN_CLASS_D_1000_CLEANUP_DELETE_FAILURE type=vnet name=${VNET}" >&2
  az network nsg delete -g "$RG" -n "$NSG" --only-show-errors >/dev/null 2>&1 || echo "TRUYN_CLASS_D_1000_CLEANUP_DELETE_FAILURE type=nsg name=${NSG}" >&2
  list_output=$(az resource list -g "$RG" --query "[?starts_with(name, '${PREFIX}')].name" -o tsv --only-show-errors 2>&1)
  list_rc=$?
  if [[ $list_rc -ne 0 ]]; then
    left=-1
    echo "TRUYN_CLASS_D_1000_CLEANUP_QUERY_FAILURE rc=${list_rc} output=${list_output}" >&2
  elif [[ -z "${list_output//[[:space:]]/}" ]]; then
    left=0
  else
    left=$(printf '%s
' "$list_output" | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')
  fi
  if [[ $list_rc -eq 0 && "$left" == 0 ]]; then CLEANUP_CONFIRMED=true; fi
  if [[ -f "$EVIDENCE" ]]; then
    tmp="${EVIDENCE}.tmp"
    jq --argjson confirmed "$CLEANUP_CONFIRMED" --argjson remaining "$left" '.cleanup.confirmed=$confirmed | .cleanup.remainingResources=$remaining' "$EVIDENCE" >"$tmp" && mv "$tmp" "$EVIDENCE"
  fi
  echo "TRUYN_CLASS_D_1000_CLEANUP confirmed=${CLEANUP_CONFIRMED} remaining=${left}"
  if [[ "$CLEANUP_CONFIRMED" != true ]]; then
    trap - EXIT
    if [[ $prior_rc -ne 0 ]]; then exit "$prior_rc"; fi
    exit 1
  fi
  return 0
}
trap cleanup EXIT
trap 'd200_err_trap "$?" "$STAGE" "$LINENO"' ERR

STAGE=preflight
[[ "$(az group exists -n "$RG" -o tsv)" == true ]]
for ns in Microsoft.Network Microsoft.Compute; do
  state=$(az provider show --namespace "$ns" --query registrationState -o tsv --only-show-errors)
  [[ "$state" == Registered ]]
done
echo "TRUYN_CLASS_D_1000 stage=preflight status=PASS commit=${GITHUB_SHA}"

STAGE=network
az network nsg create -g "$RG" -n "$NSG" -l "$LOCATION" --tags "truyn-class-d1000-run=${GITHUB_RUN_ID}" --only-show-errors >/dev/null
az network vnet create -g "$RG" -n "$VNET" -l "$LOCATION" --address-prefixes 10.252.0.0/16 --subnet-name "$SUBNET" --subnet-prefixes 10.252.1.0/24 --tags "truyn-class-d1000-run=${GITHUB_RUN_ID}" --only-show-errors >/dev/null
az network vnet subnet update -g "$RG" --vnet-name "$VNET" -n "$SUBNET" --network-security-group "$NSG" --service-endpoints Microsoft.Storage --only-show-errors >/dev/null

STAGE=provision
for i in $(seq 0 $((HOST_COUNT-1))); do
  az network nic create -g "$RG" -n "${NICS[$i]}" -l "$LOCATION" --vnet-name "$VNET" --subnet "$SUBNET" --tags "truyn-class-d1000-run=${GITHUB_RUN_ID}" --only-show-errors >/dev/null
  created=0
  for size in "$VM_SIZE" Standard_D4s_v5; do
    if az vm create -g "$RG" -n "${VMS[$i]}" -l "$LOCATION" --image Ubuntu2204 --size "$size" --admin-username truynadmin --generate-ssh-keys --nics "${NICS[$i]}" --os-disk-name "${DISKS[$i]}" --os-disk-delete-option Delete --tags "truyn-class-d1000-run=${GITHUB_RUN_ID}" --only-show-errors >/dev/null 2>&1; then
      created=1
      echo "TRUYN_CLASS_D_1000 host=$i vmSize=$size provisioned=true"
      break
    fi
  done
  [[ $created == 1 ]]
  PRIV+=("$(az network nic show -g "$RG" -n "${NICS[$i]}" --query 'ipConfigurations[0].privateIPAddress' -o tsv --only-show-errors)")
  [[ -n "${PRIV[$i]}" ]]
done

STAGE=install
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
retry_cmd() {
  local attempt rc output command_text
  printf -v command_text '%q ' "\$@"
  for attempt in 1 2 3 4 5; do
    set +e
    output=\$("\$@" 2>&1)
    rc=\$?
    set -e
    printf '%s\n' "\$output" >&2
    if [[ \$rc -eq 0 ]]; then return 0; fi
    echo "TRUYN_REMOTE_COMMAND_RETRY stage=\${install_stage} attempt=\${attempt} rc=\${rc} command=\${command_text}" >&2
    [[ \$attempt -lt 5 ]] || break
    sleep \$((attempt*3))
  done
  echo "TRUYN_REMOTE_COMMAND_FAILURE stage=\${install_stage} attempts=5 rc=\${rc} command=\${command_text}" >&2
  return "\$rc"
}
install_stage=init
trap 'rc=\$?; echo "TRUYN_REMOTE_INSTALL_FAILURE host=${i} stage=\${install_stage} line=\${LINENO} rc=\${rc} command=\${BASH_COMMAND}" >&2; exit \$rc' ERR
install_stage=runtime-prereqs
for required in python3 tar sha256sum systemctl iptables iptables-save readlink; do command -v "\$required" >/dev/null; done
install_stage=runtime-download
bundle=/tmp/truyn-d1000-runtime.tgz
rm -f "\$bundle"
python3 - '${RUNTIME_URL_B64}' "\$bundle" <<'PYRUNTIME'
import base64, sys, urllib.request
url = base64.b64decode(sys.argv[1]).decode('utf-8')
urllib.request.urlretrieve(url, sys.argv[2])
PYRUNTIME
install_stage=runtime-digest
printf '%s  %s
' '${TRUYN_CLASS_D1000_RUNTIME_SHA256}' "\$bundle" | sha256sum -c -
install_stage=runtime-extract
rm -rf /opt/truyn
mkdir -p /opt/truyn
tar -xzf "\$bundle" -C /opt/truyn
test -x /opt/truyn/runtime/bin/node
test -x /opt/truyn/runtime/bin/jq
test -x /opt/truyn/runtime/bin/curl
test -x /opt/truyn/runtime/bin/openssl
/opt/truyn/runtime/bin/node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
/opt/truyn/runtime/bin/jq --version >/dev/null
/opt/truyn/runtime/bin/curl --version >/dev/null
/opt/truyn/runtime/bin/openssl version >/dev/null
install_stage=runtime-manifest
/opt/truyn/runtime/bin/jq -e --arg sha '${GITHUB_SHA}' '.schema == "truyn.class-d1000.runtime-bundle.v1" and .sourceSha == \$sha' /opt/truyn/manifest.json >/dev/null
ln -sfn /opt/truyn/runtime/bin/node /usr/local/bin/node
ln -sfn /opt/truyn/runtime/bin/jq /usr/local/bin/jq
ln -sfn /opt/truyn/runtime/bin/curl /usr/local/bin/curl
ln -sfn /opt/truyn/runtime/bin/openssl /usr/local/bin/openssl
cd /opt/truyn/app
install_stage=quic-import
/opt/truyn/runtime/bin/node --input-type=module -e "await import('@chainsafe/libp2p-quic'); await import('@matrixai/quic'); console.log('QUIC_IMPORT=PASS')"
install_stage=node-service-import
/opt/truyn/runtime/bin/node --input-type=module -e "await import('./network/testnet/node-service.js'); console.log('NODE_SERVICE_IMPORT=PASS')"
install_stage=runtime-config
install -d -m 0700 /var/lib/truyn-d1000 /etc/truyn-d1000
openssl req -x509 -newkey rsa:2048 -nodes -keyout /etc/truyn-d1000/key.pem -out /etc/truyn-d1000/cert.pem -subj '/CN=${PRIV[$i]}' -days 1 -addext 'subjectAltName=IP:${PRIV[$i]}' >/dev/null 2>&1
for j in \$(seq 0 $((NODES_PER_HOST-1))); do
  idx=\$(( ${i} * ${NODES_PER_HOST} + j ))
  q=\$(( ${QUIC_BASE} + j )); c=\$(( ${CONTROL_BASE} + j ))
  cat >/etc/truyn-d1000/node-\${idx}.env <<ENV
TRUYN_IDENTITY_PATH=/var/lib/truyn-d1000/node-\${idx}-identity.json
TRUYN_NETWORK_STATE_PATH=/var/lib/truyn-d1000/node-\${idx}-state.json
TRUYN_TLS_KEY_PATH=/etc/truyn-d1000/key.pem
TRUYN_TLS_CERT_PATH=/etc/truyn-d1000/cert.pem
TRUYN_ADVERTISE_HOST=${PRIV[$i]}
TRUYN_QUIC_HOST=0.0.0.0
TRUYN_QUIC_PORT=\${q}
TRUYN_CONTROL_HOST=127.0.0.1
TRUYN_CONTROL_PORT=\${c}
TRUYN_PEER_RECORD_TTL_MS=1800000
TRUYN_DHT_REPLICATION_FACTOR=3
TRUYN_DHT_WRITE_QUORUM=2
TRUYN_DHT_RPC_TIMEOUT_MS=5000
TRUYN_TESTNET_FAULT_CONTROL=1
ENV
done
cat >/etc/systemd/system/truyn-d1000@.service <<'UNIT'
[Unit]
After=network-online.target
[Service]
WorkingDirectory=/opt/truyn/app
EnvironmentFile=/etc/truyn-d1000/node-%i.env
ExecStart=/opt/truyn/runtime/bin/node /opt/truyn/app/network/testnet/node-service.js
Restart=on-failure
RestartSec=1
TimeoutStopSec=15s
LimitNOFILE=65536
[Install]
WantedBy=multi-user.target
UNIT
install_stage=systemd-start
systemctl daemon-reload
for j in \$(seq 0 $((NODES_PER_HOST-1))); do idx=\$(( ${i} * ${NODES_PER_HOST} + j )); systemctl enable --now truyn-d1000@\${idx}.service >/dev/null; done
install_stage=readiness
ok=0
for n in \$(seq 1 120); do
  good=0
  for j in \$(seq 0 $((NODES_PER_HOST-1))); do curl -fsS --max-time 1 http://127.0.0.1:\$(( ${CONTROL_BASE} + j ))/status >/dev/null 2>&1 && good=\$((good+1)); done
  if [[ "\$good" -eq ${NODES_PER_HOST} ]]; then ok=1; break; fi
  sleep 2
done
if [[ "\$ok" -ne 1 ]]; then
  echo "TRUYN_REMOTE_INSTALL_READINESS_FAILURE host=${i} expected=${NODES_PER_HOST} ready=\${good}" >&2
  shown=0
  for j in \$(seq 0 $((NODES_PER_HOST-1))); do
    idx=\$(( ${i} * ${NODES_PER_HOST} + j ))
    if ! systemctl is-active --quiet truyn-d1000@\${idx}.service; then
      systemctl --no-pager --full status truyn-d1000@\${idx}.service >&2 || true
      journalctl --no-pager -u truyn-d1000@\${idx}.service -n 80 >&2 || true
      shown=\$((shown+1))
      [[ "\$shown" -ge 3 ]] && break
    fi
  done
  exit 1
fi
install_stage=records
python3 - <<'PY'
import json, urllib.request
records=[]
for p in range(${CONTROL_BASE}, ${CONTROL_BASE}+${NODES_PER_HOST}):
    records.append(json.load(urllib.request.urlopen(f'http://127.0.0.1:{p}/record'))['record'])
open('/var/lib/truyn-d1000/records.json','w').write(json.dumps(records,separators=(',',':')))
PY
pkill -f 'python3 -m http.server 9900' >/dev/null 2>&1 || true
cd /var/lib/truyn-d1000
nohup python3 -m http.server 9900 --bind '${PRIV[$i]}' >/tmp/truyn-d1000-record-server.log 2>&1 &
ids=\$(jq -r '.[].nodeId' records.json)
uc=\$(printf '%s\n' "\$ids" | sort -u | wc -l)
ep=\$(jq -r '.[].endpoints[0]' records.json | sort -u | wc -l)
proc=\$(pgrep -fc 'network/testnet/node-service.js')
[[ "\$uc" -eq ${NODES_PER_HOST} && "\$ep" -eq ${NODES_PER_HOST} && "\$proc" -ge ${NODES_PER_HOST} ]]
echo READY=${NODES_PER_HOST}
echo IDENTITIES=\$uc
echo ENDPOINTS=\$ep
echo PROCESSES=\$proc
EOS
)
  script="${script//truyn/truyn}"
  out=$(remote "${VMS[$i]}" "$script")
  [[ "$(marker "$out" READY)" == "$NODES_PER_HOST" ]]
  echo "TRUYN_CLASS_D_1000 stage=install host=$i processes=${NODES_PER_HOST} identities=${NODES_PER_HOST} endpoints=${NODES_PER_HOST} status=PASS"
done

STAGE=bootstrap-record-refresh
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
bootstrap_dir=$(mktemp -d)
bootstrap_pids=()
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
ips='${IPS_JSON}'
rm -f /tmp/all-host-records.jsonl
for ip in \$(printf '%s' "\$ips" | jq -r '.[]'); do
  curl -fsS --max-time 20 "http://\${ip}:9900/records.json" | jq -c '.' >>/tmp/all-host-records.jsonl
done
jq -s '.' /tmp/all-host-records.jsonl >/tmp/records-by-host.json
jq '[.[][]]' /tmp/records-by-host.json >/tmp/all-records.json
[[ "\$(jq 'length' /tmp/records-by-host.json)" -eq ${HOST_COUNT} ]]
[[ "\$(jq 'length' /tmp/all-records.json)" -eq ${NODE_COUNT} ]]
[[ "\$(jq -r '.[].nodeId' /tmp/all-records.json | sort -u | wc -l)" -eq ${NODE_COUNT} ]]
[[ "\$(jq -r '.[].endpoints[0]' /tmp/all-records.json | sort -u | wc -l)" -eq ${NODE_COUNT} ]]
cd /opt/truyn
TRUYN_BOOTSTRAP_PLAN_SEED='${GITHUB_SHA}' TRUYN_BOOTSTRAP_MAX_PEERS_PER_NODE=${BOOTSTRAP_MAX_PEERS_PER_NODE} TRUYN_BOOTSTRAP_PEERS_PER_BUCKET=${BOOTSTRAP_PEERS_PER_BUCKET} TRUYN_BOOTSTRAP_REQUIRED_FAILURE_DOMAINS=${HOST_COUNT} node --input-type=module <<'NODE'
import fs from 'node:fs';
import {
  buildClassD1000BootstrapPlan,
  summarizeClassD1000BootstrapPlan
} from '/opt/truyn/benchmarks/scale/class-d-1000-bootstrap.js';

const records = JSON.parse(fs.readFileSync('/tmp/all-records.json', 'utf8'));
const maxPeersPerNode = Number.parseInt(process.env.TRUYN_BOOTSTRAP_MAX_PEERS_PER_NODE || '32', 10);
const peersPerBucket = Number.parseInt(process.env.TRUYN_BOOTSTRAP_PEERS_PER_BUCKET || '2', 10);
const requiredFailureDomains = Number.parseInt(process.env.TRUYN_BOOTSTRAP_REQUIRED_FAILURE_DOMAINS || '0', 10);
const plan = buildClassD1000BootstrapPlan(records, {
  seed: process.env.TRUYN_BOOTSTRAP_PLAN_SEED || 'truyn-class-d-1000',
  maxPeersPerNode,
  peersPerBucket,
  requiredFailureDomains
});
const summary = summarizeClassD1000BootstrapPlan(plan);
if (summary.nodeCount !== records.length) throw new Error('bootstrap plan node count mismatch');
if (summary.minPeers !== maxPeersPerNode || summary.maxPeers !== maxPeersPerNode) throw new Error('bootstrap plan peer bound mismatch');
if (summary.allToAll) throw new Error('bootstrap plan must not be all-to-all');
if (summary.minFailureDomains !== requiredFailureDomains || summary.maxFailureDomains !== requiredFailureDomains) throw new Error('bootstrap plan failure-domain coverage mismatch');
const byNode = {};
for (const [nodeId, peers] of plan.entries()) {
  const peerIds = peers.map((peer) => peer.nodeId);
  if (peerIds.includes(nodeId)) throw new Error('bootstrap plan contains self peer for ' + nodeId);
  if (new Set(peerIds).size !== peerIds.length) throw new Error('bootstrap plan contains duplicate peers for ' + nodeId);
  byNode[nodeId] = peers;
}
fs.writeFileSync('/tmp/bootstrap-plan-by-node.json', JSON.stringify(byNode));
fs.writeFileSync('/tmp/bootstrap-plan-summary.json', JSON.stringify(summary));
NODE
cp /tmp/records-by-host.json /var/lib/truyn-d1000/records-by-host.json
cp /tmp/bootstrap-plan-by-node.json /var/lib/truyn-d1000/bootstrap-plan-by-node.json
cp /tmp/bootstrap-plan-summary.json /var/lib/truyn-d1000/bootstrap-plan-summary.json
min_records=999999
max_records=0
min_bytes=999999999
max_bytes=0
total_bytes=0
refresh_count=0
refresh_min_valid=999999
refresh_max_valid=0
refresh_min_buckets=999999
refresh_max_buckets=0
refresh_min_endpoints=999999
refresh_max_endpoints=0
refresh_min_hosts=999999
refresh_max_hosts=0
t0=\$(date +%s%3N)
for j in \$(seq 0 $((NODES_PER_HOST-1))); do
  node_id=\$(jq -r --argjson host ${i} --argjson node "\$j" '.[\$host][\$node].nodeId' /tmp/records-by-host.json)
  payload=\$(jq -c --arg node "\$node_id" '{records:.[\$node]}' /tmp/bootstrap-plan-by-node.json)
  records=\$(jq -r --arg node "\$node_id" '.[\$node] | length' /tmp/bootstrap-plan-by-node.json)
  [[ "\$records" -eq ${BOOTSTRAP_MAX_PEERS_PER_NODE} ]]
  if printf '%s' "\$payload" | jq -e --arg node "\$node_id" '.records | any(.nodeId == \$node)' >/dev/null; then echo "self peer leaked for \$node_id" >&2; exit 1; fi
  unique=\$(printf '%s' "\$payload" | jq -r '.records[].nodeId' | sort -u | wc -l | tr -d ' ')
  [[ "\$unique" -eq "\$records" ]]
  bytes=\$(printf '%s' "\$payload" | wc -c | tr -d ' ')
  [[ "\$bytes" -lt 900000 ]]
  if [[ "\$records" -lt "\$min_records" ]]; then min_records="\$records"; fi
  if [[ "\$records" -gt "\$max_records" ]]; then max_records="\$records"; fi
  if [[ "\$bytes" -lt "\$min_bytes" ]]; then min_bytes="\$bytes"; fi
  if [[ "\$bytes" -gt "\$max_bytes" ]]; then max_bytes="\$bytes"; fi
  total_bytes=\$((total_bytes + bytes))
  control_url="http://127.0.0.1:\$(( ${CONTROL_BASE} + j ))"
  curl -fsS --max-time 90 -H 'content-type: application/json' --data-binary "\$payload" "\${control_url}/bootstrap" >/dev/null
  refresh_payload=\$(jq -cn --arg seed "${GITHUB_SHA}:bootstrap-refresh:${i}:\$j" '{targetCount:${BOOTSTRAP_MAX_PEERS_PER_NODE},maxRounds:4,seed:\$seed}')
  refresh_result=''
  refresh_rc=1
  for refresh_attempt in 1 2 3; do
    set +e
    refresh_result=\$(curl -fsS --max-time 300 -H 'content-type: application/json' --data-binary "\$refresh_payload" "\${control_url}/dht/refresh")
    refresh_rc=\$?
    set -e
    if [[ "\$refresh_rc" -eq 0 ]]; then break; fi
    echo "TRUYN_D200_BOOTSTRAP_REFRESH_RETRY host=${i} node=\$j attempt=\$refresh_attempt rc=\$refresh_rc" >&2
    [[ "\$refresh_attempt" -lt 3 ]] && sleep \$((refresh_attempt * 2))
  done
  [[ "\$refresh_rc" -eq 0 ]]
  [[ "\$(printf '%s' "\$refresh_result" | jq -r '.refreshed')" == true ]]
  readiness=\$(curl -fsS --max-time 20 "\${control_url}/dht/readiness")
  [[ "\$(printf '%s' "\$readiness" | jq -r '.refresh.status')" == refreshed ]]
  valid=\$(printf '%s' "\$readiness" | jq -r '.validPeers')
  buckets=\$(printf '%s' "\$readiness" | jq -r '.populatedBuckets')
  endpoints=\$(printf '%s' "\$readiness" | jq -r '.remoteEndpointDiversity.endpointCount')
  hosts=\$(printf '%s' "\$readiness" | jq -r '.remoteEndpointDiversity.hostCount')
  [[ "\$valid" -ge "\$records" ]]
  if [[ "\$valid" -lt "\$refresh_min_valid" ]]; then refresh_min_valid="\$valid"; fi
  if [[ "\$valid" -gt "\$refresh_max_valid" ]]; then refresh_max_valid="\$valid"; fi
  if [[ "\$buckets" -lt "\$refresh_min_buckets" ]]; then refresh_min_buckets="\$buckets"; fi
  if [[ "\$buckets" -gt "\$refresh_max_buckets" ]]; then refresh_max_buckets="\$buckets"; fi
  if [[ "\$endpoints" -lt "\$refresh_min_endpoints" ]]; then refresh_min_endpoints="\$endpoints"; fi
  if [[ "\$endpoints" -gt "\$refresh_max_endpoints" ]]; then refresh_max_endpoints="\$endpoints"; fi
  if [[ "\$hosts" -lt "\$refresh_min_hosts" ]]; then refresh_min_hosts="\$hosts"; fi
  if [[ "\$hosts" -gt "\$refresh_max_hosts" ]]; then refresh_max_hosts="\$hosts"; fi
  refresh_count=\$((refresh_count + 1))
done
t1=\$(date +%s%3N)
mean_bytes=\$((total_bytes / ${NODES_PER_HOST}))
echo BOOTSTRAP_MS=\$((t1-t0))
echo BOOTSTRAP_PLAN_NODE_COUNT=\$(jq -r '.nodeCount' /tmp/bootstrap-plan-summary.json)
echo BOOTSTRAP_PLAN_MIN_RECORDS=\$min_records
echo BOOTSTRAP_PLAN_MAX_RECORDS=\$max_records
echo BOOTSTRAP_PLAN_ALL_TO_ALL=\$(jq -r '.allToAll' /tmp/bootstrap-plan-summary.json)
echo BOOTSTRAP_PLAN_MIN_FAILURE_DOMAINS=\$(jq -r '.minFailureDomains' /tmp/bootstrap-plan-summary.json)
echo BOOTSTRAP_PLAN_MAX_FAILURE_DOMAINS=\$(jq -r '.maxFailureDomains' /tmp/bootstrap-plan-summary.json)
echo BOOTSTRAP_MIN_BYTES=\$min_bytes
echo BOOTSTRAP_MAX_BYTES=\$max_bytes
echo BOOTSTRAP_MEAN_BYTES=\$mean_bytes
echo BOOTSTRAP_REFRESH_COUNT=\$refresh_count
echo BOOTSTRAP_REFRESH_STATUS=refreshed
echo BOOTSTRAP_REFRESH_MIN_VALID=\$refresh_min_valid
echo BOOTSTRAP_REFRESH_MAX_VALID=\$refresh_max_valid
echo BOOTSTRAP_REFRESH_MIN_BUCKETS=\$refresh_min_buckets
echo BOOTSTRAP_REFRESH_MAX_BUCKETS=\$refresh_max_buckets
echo BOOTSTRAP_REFRESH_MIN_ENDPOINTS=\$refresh_min_endpoints
echo BOOTSTRAP_REFRESH_MAX_ENDPOINTS=\$refresh_max_endpoints
echo BOOTSTRAP_REFRESH_MIN_HOSTS=\$refresh_min_hosts
echo BOOTSTRAP_REFRESH_MAX_HOSTS=\$refresh_max_hosts
EOS
)
  script="${script//truyn/truyn}"
  script="${script//truyn/truyn}"
  (
    out=$(remote "${VMS[$i]}" "$script")
    [[ "$(marker "$out" BOOTSTRAP_PLAN_MIN_RECORDS)" == "$BOOTSTRAP_MAX_PEERS_PER_NODE" ]]
    [[ "$(marker "$out" BOOTSTRAP_PLAN_MAX_RECORDS)" == "$BOOTSTRAP_MAX_PEERS_PER_NODE" ]]
    [[ "$(marker "$out" BOOTSTRAP_PLAN_ALL_TO_ALL)" == false ]]
    [[ "$(marker "$out" BOOTSTRAP_PLAN_MIN_FAILURE_DOMAINS)" == "$HOST_COUNT" ]]
    [[ "$(marker "$out" BOOTSTRAP_PLAN_MAX_FAILURE_DOMAINS)" == "$HOST_COUNT" ]]
    [[ "$(marker "$out" BOOTSTRAP_REFRESH_COUNT)" == "$NODES_PER_HOST" ]]
    [[ "$(marker "$out" BOOTSTRAP_REFRESH_STATUS)" == refreshed ]]
    echo "TRUYN_CLASS_D_1000 stage=bootstrap host=$i plan=host-stratified-xor refresh=per-node recordsMin=$(marker "$out" BOOTSTRAP_PLAN_MIN_RECORDS) recordsMax=$(marker "$out" BOOTSTRAP_PLAN_MAX_RECORDS) refreshCount=$(marker "$out" BOOTSTRAP_REFRESH_COUNT) validMin=$(marker "$out" BOOTSTRAP_REFRESH_MIN_VALID) validMax=$(marker "$out" BOOTSTRAP_REFRESH_MAX_VALID) bucketsMin=$(marker "$out" BOOTSTRAP_REFRESH_MIN_BUCKETS) bucketsMax=$(marker "$out" BOOTSTRAP_REFRESH_MAX_BUCKETS) endpointsMin=$(marker "$out" BOOTSTRAP_REFRESH_MIN_ENDPOINTS) endpointsMax=$(marker "$out" BOOTSTRAP_REFRESH_MAX_ENDPOINTS) hostsMin=$(marker "$out" BOOTSTRAP_REFRESH_MIN_HOSTS) hostsMax=$(marker "$out" BOOTSTRAP_REFRESH_MAX_HOSTS) bytesMin=$(marker "$out" BOOTSTRAP_MIN_BYTES) bytesMax=$(marker "$out" BOOTSTRAP_MAX_BYTES) bytesMean=$(marker "$out" BOOTSTRAP_MEAN_BYTES) ms=$(marker "$out" BOOTSTRAP_MS)"
  ) >"$bootstrap_dir/$i" &
  bootstrap_pids+=("$!")
done
for pid in "${bootstrap_pids[@]}"; do wait "$pid"; done
for i in $(seq 0 $((HOST_COUNT-1))); do cat "$bootstrap_dir/$i"; done
rm -rf "$bootstrap_dir"

STAGE=bandwidth-meter
meter_dir=$(mktemp -d)
meter_pids=()
for i in $(seq 0 $((HOST_COUNT-1))); do
  (remote "${VMS[$i]}" "iptables -I OUTPUT 1 -p udp --dport ${QUIC_BASE}:$((QUIC_BASE+NODES_PER_HOST-1)) -m comment --comment truyn-d1000-meter-out -j ACCEPT; iptables -I INPUT 1 -p udp --sport ${QUIC_BASE}:$((QUIC_BASE+NODES_PER_HOST-1)) -m comment --comment truyn-d1000-meter-in -j ACCEPT; echo METER=1" >"$meter_dir/$i") &
  meter_pids+=("$!")
done
meter_failed=0
for pid in "${meter_pids[@]}"; do
  if ! wait "$pid"; then meter_failed=1; fi
done
if [[ "$meter_failed" != 0 ]]; then
  rm -rf "$meter_dir"
  false
fi
for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$meter_dir/$i")"
  [[ "$(marker "$out" METER)" == 1 ]]
  echo "TRUYN_CLASS_D_1000 stage=bandwidth-meter host=$i mode=parallel-hosts status=PASS"
done
rm -rf "$meter_dir"
