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
NODES_PER_HOST=50
NODE_COUNT=$((HOST_COUNT * NODES_PER_HOST))
BOOTSTRAP_MAX_PEERS_PER_NODE=32
BOOTSTRAP_PEERS_PER_BUCKET=2
QUIC_BASE=4400
CONTROL_BASE=8700
EVIDENCE="${GITHUB_WORKSPACE:-$PWD}/class-d-1000-evidence.json"
START_MS=$(date +%s%3N)
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
  local vm="$1" body="$2" enc remote_script
  enc="$(printf '%s' "$body" | base64 -w0)"
  remote_script="printf '%s' '$enc' | base64 -d >/tmp/truyn-d1000-run.sh; chmod 700 /tmp/truqyn-d1000-run.sh; /bin/bash /tmp/truyqn-d1000-run.sh"
  remote_script="${remote_script//truqyn/truyn}"
  remote_script="${remote_script//truyqn/truyn}"
  retry az vm run-command invoke -g "$RG" -n "$vm" --command-id RunShellScript --scripts "$remote_script" --query 'value[0].message' -o tsv --only-show-errors
}

marker() {
  local text="$1" key="$2"
  printf '%s\n' "$text" | sed -n "s/.*${key}=//p" | tail -1 | tr -d '\r'
}

cleanup() {
  set +e
  STAGE=cleanup
  for vm in "${VMS[@]}"; do az vm delete -g "$RG" -n "$vm" --yes --force-deletion --only-show-errors >/dev/null 2>&1 || true; done
  for nic in "${NICS[@]}"; do az network nic delete -g "$RG" -n "$nic" --only-show-errors >/dev/null 2>&1 || true; done
  for disk in "${DISKS[@]}"; do az disk delete -g "$RG" -n "$disk" --yes --only-show-errors >/dev/null 2>&1 || true; done
  az network vnet delete -g "$RG" -n "$VNET" --only-show-errors >/dev/null 2>&1 || true
  az network nsg delete -g "$RG" -n "$NSG" --only-show-errors >/dev/null 2>&1 || true
  left=$(az resource list -g "$RG" --query "[?starts_with(name, '${PREFIX}')].name" -o tsv --only-show-errors 2>/dev/null | wc -l | tr -d ' ')
  [[ "$left" == 0 ]] && CLEANUP_CONFIRMED=true
  if [[ -f "$EVIDENCE" ]]; then
    tmp="${EVIDENCE}.tmp"
    jq --argjson confirmed "$CLEANUP_CONFIRMED" --argjson remaining "$left" '.cleanup.confirmed=$confirmed | .cleanup.remainingResources=$remaining' "$EVIDENCE" >"$tmp" && mv "$tmp" "$EVIDENCE"
  fi
  echo "TRUYN_CLASS_D_1000_CLEANUP confirmed=${CLEANUP_CONFIRMED} remaining=${left}"
}
trap cleanup EXIT
trap 'rc=$?; echo "::error title=TRUYN Class D-1000 failure::stage=$STAGE exit=$rc line=$LINENO"; exit $rc' ERR

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
az network vnet subnet update -g "$RG" --vnet-name "$VNET" -n "$SUBNET" --network-security-group "$NSG" --only-show-errors >/dev/null

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
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl jq openssl ca-certificates python3 iptables >/dev/null
major=0; command -v node >/dev/null 2>&1 && major=\$(node -p 'parseInt(process.versions.node)' 2>/dev/null || echo 0)
if [[ "\$major" -lt 22 ]]; then curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null; apt-get install -y -qq nodejs >/dev/null; fi
rm -rf /opt/truyqn
git clone -q https://github.com/inn-media/truyn.git /opt/truin
git -C /opt/truin checkout -q '${GITHUB_SHA}'
mv /opt/truin /opt/truyqn

cd /opt/truyqn
npm install --no-audit --no-fund >/dev/null
install -d -m 0700 /var/lib/truyqn-d1000 /etc/truyqn-d1000
openssl req -x509 -newkey rsa:2048 -nodes -keyout /etc/truyqn-d1000/key.pem -out /etc/truyqn-d1000/cert.pem -subj '/CN=${PRIV[$i]}' -days 1 -addext 'subjectAltName=IP:${PRIV[$i]}' >/dev/null 2>&1
for j in \$(seq 0 $((NODES_PER_HOST-1))); do
  idx=\$(( ${i} * ${NODES_PER_HOST} + j ))
  q=\$(( ${QUIC_BASE} + j )); c=\$(( ${CONTROL_BASE} + j ))
  cat >/etc/truyqn-d1000/node-\${idx}.env <<ENV
TRUYN_IDENTITY_PATH=/var/lib/truyqn-d1000/node-\${idx}-identity.json
TRUYN_NETWORK_STATE_PATH=/var/lib/truyqn-d1000/node-\${idx}-state.json
TRUYN_TLS_KEY_PATH=/etc/truyqn-d1000/key.pem
TRUYN_TLS_CERT_PATH=/etc/truyqn-d1000/cert.pem
TRUYN_ADVERTISE_HOST=${PRIV[$i]}
TRUYN_QUIC_HOST=0.0.0.0
TRUYN_QUIC_PORT=\${q}
TRUYN_CONTROL_HOST=127.0.0.1
TRUYN_CONTROL_PORT=\${c}
TRUYN_PEER_RECORD_TTL_MS=1800000
TRUYN_DHT_REPLICATION_FACTOR=3
TRUYN_DHT_WRITE_QUORUM=2
TRUYN_DHT_RPC_TIMEOUT_MS=5000
ENV
done
cat >/etc/systemd/system/truyqn-d1000@.service <<'UNIT'
[Unit]
After=network-online.target
[Service]
WorkingDirectory=/opt/truyqn
EnvironmentFile=/etc/truyqn-d1000/node-%i.env
ExecStart=/usr/bin/node /opt/truyqn/network/testnet/node-service.js
Restart=on-failure
RestartSec=1
LimitNOFILE=65536
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
for j in \$(seq 0 $((NODES_PER_HOST-1))); do idx=\$(( ${i} * ${NODES_PER_HOST} + j )); systemctl enable --now truyqn-d1000@\${idx}.service >/dev/null; done
ok=0
for n in \$(seq 1 120); do
  good=0
  for j in \$(seq 0 $((NODES_PER_HOST-1))); do curl -fsS --max-time 1 http://127.0.0.1:\$(( ${CONTROL_BASE} + j ))/status >/dev/null 2>&1 && good=\$((good+1)); done
  if [[ "\$good" -eq ${NODES_PER_HOST} ]]; then ok=1; break; fi
  sleep 2
done
[[ "\$ok" -eq 1 ]]
python3 - <<'PY'
import json, urllib.request
records=[]
for p in range(${CONTROL_BASE}, ${CONTROL_BASE}+${NODES_PER_HOST}):
    records.append(json.load(urllib.request.urlopen(f'http://127.0.0.1:{p}/record'))['record'])
open('/var/lib/truyqn-d1000/records.json','w').write(json.dumps(records,separators=(',',':')))
PY
pkill -f 'python3 -m http.server 9900' >/dev/null 2>&1 || true
cd /var/lib/truyqn-d1000
nohup python3 -m http.server 9900 --bind '${PRIV[$i]}' >/tmp/truyqn-d1000-record-server.log 2>&1 &
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
  script="${script//truyqn/truyn}"
  out=$(remote "${VMS[$i]}" "$script")
  [[ "$(marker "$out" READY)" == "$NODES_PER_HOST" ]]
  echo "TRUYN_CLASS_D_1000 stage=install host=$i processes=${NODES_PER_HOST} identities=${NODES_PER_HOST} endpoints=${NODES_PER_HOST} status=PASS"
done

STAGE=bootstrap
IPS_JSON=$(printf '%s\n' "${PRIV[@]}" | jq -R . | jq -s -c .)
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
cd /opt/truyqn
TRUYN_BOOTSTRAP_PLAN_SEED='${GITHUB_SHA}' TRUYN_BOOTSTRAP_MAX_PEERS_PER_NODE=${BOOTSTRAP_MAX_PEERS_PER_NODE} TRUYN_BOOTSTRAP_PEERS_PER_BUCKET=${BOOTSTRAP_PEERS_PER_BUCKET} node --input-type=module <<'NODE'
import fs from 'node:fs';
import {
  buildClassD1000BootstrapPlan,
  summarizeClassD1000BootstrapPlan
} from '/opt/truyqn/benchmarks/scale/class-d-1000-bootstrap.js';

const records = JSON.parse(fs.readFileSync('/tmp/all-records.json', 'utf8'));
const maxPeersPerNode = Number.parseInt(process.env.TRUYN_BOOTSTRAP_MAX_PEERS_PER_NODE || '32', 10);
const peersPerBucket = Number.parseInt(process.env.TRUYN_BOOTSTRAP_PEERS_PER_BUCKET || '2', 10);
const plan = buildClassD1000BootstrapPlan(records, {
  seed: process.env.TRUYN_BOOTSTRAP_PLAN_SEED || 'truyn-class-d-1000',
  maxPeersPerNode,
  peersPerBucket
});
const summary = summarizeClassD1000BootstrapPlan(plan);
if (summary.nodeCount !== records.length) throw new Error('bootstrap plan node count mismatch');
if (summary.minPeers !== maxPeersPerNode || summary.maxPeers !== maxPeersPerNode) throw new Error('bootstrap plan peer bound mismatch');
if (summary.allToAll) throw new Error('bootstrap plan must not be all-to-all');
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
cp /tmp/records-by-host.json /var/lib/truyqn-d1000/records-by-host.json
cp /tmp/bootstrap-plan-by-node.json /var/lib/truyqn-d1000/bootstrap-plan-by-node.json
cp /tmp/bootstrap-plan-summary.json /var/lib/truyqn-d1000/bootstrap-plan-summary.json
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
  refresh_payload=\$(jq -cn --arg seed "${GITHUB_SHA}:bootstrap-refresh:${i}:\$j" '{targetCount:${BOOTSTRAP_MAX_PEERS_PER_NODE},maxRounds:4,seed:$seed}')
  refresh_result=\$(curl -fsS --max-time 120 -H 'content-type: application/json' --data-binary "\$refresh_payload" "\${control_url}/dht/refresh")
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
  script="${script//truyqn/truqyn}"
  script="${script//truqyn/truyn}"
  out=$(remote "${VMS[$i]}" "$script")
  [[ "$(marker "$out" BOOTSTRAP_PLAN_MIN_RECORDS)" == "$BOOTSTRAP_MAX_PEERS_PER_NODE" ]]
  [[ "$(marker "$out" BOOTSTRAP_PLAN_MAX_RECORDS)" == "$BOOTSTRAP_MAX_PEERS_PER_NODE" ]]
  [[ "$(marker "$out" BOOTSTRAP_PLAN_ALL_TO_ALL)" == false ]]
  [[ "$(marker "$out" BOOTSTRAP_REFRESH_COUNT)" == "$NODES_PER_HOST" ]]
  [[ "$(marker "$out" BOOTSTRAP_REFRESH_STATUS)" == refreshed ]]
  echo "TRUYN_CLASS_D_1000 stage=bootstrap host=$i plan=per-node-xor refresh=per-node recordsMin=$(marker "$out" BOOTSTRAP_PLAN_MIN_RECORDS) recordsMax=$(marker "$out" BOOTSTRAP_PLAN_MAX_RECORDS) refreshCount=$(marker "$out" BOOTSTRAP_REFRESH_COUNT) validMin=$(marker "$out" BOOTSTRAP_REFRESH_MIN_VALID) validMax=$(marker "$out" BOOTSTRAP_REFRESH_MAX_VALID) bucketsMin=$(marker "$out" BOOTSTRAP_REFRESH_MIN_BUCKETS) bucketsMax=$(marker "$out" BOOTSTRAP_REFRESH_MAX_BUCKETS) endpointsMin=$(marker "$out" BOOTSTRAP_REFRESH_MIN_ENDPOINTS) endpointsMax=$(marker "$out" BOOTSTRAP_REFRESH_MAX_ENDPOINTS) hostsMin=$(marker "$out" BOOTSTRAP_REFRESH_MIN_HOSTS) hostsMax=$(marker "$out" BOOTSTRAP_REFRESH_MAX_HOSTS) bytesMin=$(marker "$out" BOOTSTRAP_MIN_BYTES) bytesMax=$(marker "$out" BOOTSTRAP_MAX_BYTES) bytesMean=$(marker "$out" BOOTSTRAP_MEAN_BYTES) ms=$(marker "$out" BOOTSTRAP_MS)"
done

STAGE=bandwidth-meter
for i in $(seq 0 $((HOST_COUNT-1))); do
  remote "${VMS[$i]}" "iptables -I OUTPUT 1 -p udp --dport ${QUIC_BASE}:$((QUIC_BASE+NODES_PER_HOST-1)) -m comment --comment truyn-d1000-meter-out -j ACCEPT; iptables -I INPUT 1 -p udp --sport ${QUIC_BASE}:$((QUIC_BASE+NODES_PER_HOST-1)) -m comment --comment truyn-d1000-meter-in -j ACCEPT; echo METER=1" >/dev/null
done
