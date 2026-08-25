#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
source "$ROOT/scripts/lib/class-d-run-command.sh"

: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
BUNDLE="${1:?usage: class-d-1000-vm-smoke-preflight.sh BUNDLE SHA256}"
EXPECTED_SHA="${2:?usage: class-d-1000-vm-smoke-preflight.sh BUNDLE SHA256}"
RG="${TRUYN_AZURE_RESOURCE_GROUP:-truyn}"
LOCATION="${TRUYN_CLASS_D1000_LOCATION:-eastus2}"
VM_SIZE="${TRUYN_CLASS_D1000_VM_SIZE:-Standard_E2as_v7}"
PREFIX="truyn-d1000-smoke-${GITHUB_RUN_ID}"
VM="${PREFIX}-vm"
NIC="${PREFIX}-nic"
DISK="${PREFIX}-os"
VNET="${PREFIX}-vnet"
SUBNET="${PREFIX}-subnet"
NSG="${PREFIX}-nsg"
STAGING_ACCOUNT="td1ksm${GITHUB_RUN_ID}"
STAGING_CONTAINER="runtime"
STAGING_BLOB="truyn-d1000-runtime.tgz"
SMOKE_GUEST_PASS=false

cleanup() {
  local original_rc=$? left=1 storage_left=1 cleanup_ok=false
  trap - EXIT
  set +e
  az vm delete -g "$RG" -n "$VM" --yes --force-deletion --only-show-errors >/dev/null 2>&1 || true
  az network nic delete -g "$RG" -n "$NIC" --only-show-errors >/dev/null 2>&1 || true
  az disk delete -g "$RG" -n "$DISK" --yes --only-show-errors >/dev/null 2>&1 || true
  az network vnet delete -g "$RG" -n "$VNET" --only-show-errors >/dev/null 2>&1 || true
  az network nsg delete -g "$RG" -n "$NSG" --only-show-errors >/dev/null 2>&1 || true
  az storage account delete -g "$RG" -n "$STAGING_ACCOUNT" --yes --only-show-errors >/dev/null 2>&1 || true

  for _ in $(seq 1 30); do
    left="$(az resource list -g "$RG" --query "[?starts_with(name, '${PREFIX}')].name" -o tsv --only-show-errors 2>/dev/null | wc -l | tr -d ' ')"
    if az storage account show -g "$RG" -n "$STAGING_ACCOUNT" >/dev/null 2>&1; then
      storage_left=1
    else
      storage_left=0
    fi
    if [[ "$left" == 0 && "$storage_left" == 0 ]]; then
      cleanup_ok=true
      break
    fi
    sleep 10
  done

  if [[ "$original_rc" == 0 && "$SMOKE_GUEST_PASS" == true && "$cleanup_ok" == true ]]; then
    echo "TRUYN_CLASS_D1000_VM_SMOKE=PASS guest=true cleanup=true remaining=0 location=${LOCATION} vmSize=${VM_SIZE}"
    exit 0
  fi
  echo "TRUYN_CLASS_D1000_VM_SMOKE=FAIL guest=${SMOKE_GUEST_PASS} cleanup=${cleanup_ok} remaining=${left} storageRemaining=${storage_left} rc=${original_rc}" >&2
  [[ "$original_rc" == 0 ]] && original_rc=1
  exit "$original_rc"
}
trap cleanup EXIT

[[ -s "$BUNDLE" ]]
[[ "$EXPECTED_SHA" =~ ^[0-9a-f]{64}$ ]]
printf '%s  %s\n' "$EXPECTED_SHA" "$BUNDLE" | sha256sum -c -
[[ "$(az group exists -n "$RG" -o tsv)" == true ]]

if az storage account show -g "$RG" -n "$STAGING_ACCOUNT" >/dev/null 2>&1; then
  echo "smoke staging account unexpectedly exists: $STAGING_ACCOUNT" >&2
  exit 1
fi

az storage account create -g "$RG" -n "$STAGING_ACCOUNT" -l "$LOCATION" \
  --sku Standard_LRS --kind StorageV2 --https-only true --min-tls-version TLS1_2 \
  --allow-blob-public-access false -o none --only-show-errors
key="$(az storage account keys list -g "$RG" -n "$STAGING_ACCOUNT" --query '[0].value' -o tsv --only-show-errors)"
[[ -n "$key" ]]
echo "::add-mask::$key"
az storage container create --name "$STAGING_CONTAINER" --account-name "$STAGING_ACCOUNT" --account-key "$key" -o none --only-show-errors
az storage blob upload --container-name "$STAGING_CONTAINER" --name "$STAGING_BLOB" --file "$BUNDLE" \
  --account-name "$STAGING_ACCOUNT" --account-key "$key" --overwrite true -o none --only-show-errors
expiry="$(date -u -d '+2 hours' '+%Y-%m-%dT%H:%MZ')"
sas="$(az storage blob generate-sas --container-name "$STAGING_CONTAINER" --name "$STAGING_BLOB" \
  --account-name "$STAGING_ACCOUNT" --account-key "$key" --permissions r --https-only --expiry "$expiry" -o tsv --only-show-errors)"
[[ -n "$sas" ]]
echo "::add-mask::$sas"
url="https://${STAGING_ACCOUNT}.blob.core.windows.net/${STAGING_CONTAINER}/${STAGING_BLOB}?${sas}"
echo "::add-mask::$url"
url_b64="$(printf '%s' "$url" | base64 -w0)"

az network nsg create -g "$RG" -n "$NSG" -l "$LOCATION" --tags "truyn-class-d1000-smoke=${GITHUB_RUN_ID}" --only-show-errors >/dev/null
az network vnet create -g "$RG" -n "$VNET" -l "$LOCATION" --address-prefixes 10.253.0.0/24 \
  --subnet-name "$SUBNET" --subnet-prefixes 10.253.0.0/26 --tags "truyn-class-d1000-smoke=${GITHUB_RUN_ID}" --only-show-errors >/dev/null
az network vnet subnet update -g "$RG" --vnet-name "$VNET" -n "$SUBNET" --network-security-group "$NSG" --only-show-errors >/dev/null
az network nic create -g "$RG" -n "$NIC" -l "$LOCATION" --vnet-name "$VNET" --subnet "$SUBNET" \
  --tags "truyn-class-d1000-smoke=${GITHUB_RUN_ID}" --only-show-errors >/dev/null
az vm create -g "$RG" -n "$VM" -l "$LOCATION" --image Ubuntu2204 --size "$VM_SIZE" --admin-username truynadmin \
  --generate-ssh-keys --nics "$NIC" --os-disk-name "$DISK" --os-disk-delete-option Delete \
  --tags "truyn-class-d1000-smoke=${GITHUB_RUN_ID}" --only-show-errors >/dev/null

guest_script=$(cat <<EOS
set -Eeuo pipefail
for required in python3 tar sha256sum systemctl iptables iptables-save; do
  command -v "\$required" >/dev/null
  echo "TRUYN_VM_SMOKE_BASE_TOOL=\$required"
done
bundle=/tmp/truyn-d1000-runtime.tgz
rm -f "\$bundle"
python3 - '${url_b64}' "\$bundle" <<'PY'
import base64, sys, urllib.request
url = base64.b64decode(sys.argv[1]).decode('utf-8')
urllib.request.urlretrieve(url, sys.argv[2])
PY
printf '%s  %s\n' '${EXPECTED_SHA}' "\$bundle" | sha256sum -c -
rm -rf /opt/truyn
mkdir -p /opt/truyn
tar -xzf "\$bundle" -C /opt/truyn
for tool in node jq curl openssl; do
  test -x "/opt/truyn/runtime/bin/\$tool"
  echo "TRUYN_VM_SMOKE_RUNTIME_TOOL=\$tool"
done
/opt/truyn/runtime/bin/node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)'
/opt/truyn/runtime/bin/jq --version >/dev/null
/opt/truyn/runtime/bin/curl --version >/dev/null
/opt/truyn/runtime/bin/openssl version >/dev/null
/opt/truyn/runtime/bin/openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/truyn-smoke-key.pem -out /tmp/truyn-smoke-cert.pem -subj '/CN=truyn-smoke' -days 1 >/dev/null 2>&1
/opt/truyn/runtime/bin/node -e "import('/opt/truyn/app/network/testnet/node-service.js').then(()=>console.log('TRUYN_VM_SMOKE_NODE_IMPORT=PASS'))"
echo TRUYN_VM_SMOKE_GUEST=PASS
EOS
)

out="$(truyn_class_d_remote "$RG" "$VM" "$guest_script")"
printf '%s\n' "$out"
grep -Fq 'TRUYN_VM_SMOKE_GUEST=PASS' <<<"$out"
grep -Fq 'TRUYN_VM_SMOKE_NODE_IMPORT=PASS' <<<"$out"
SMOKE_GUEST_PASS=true
