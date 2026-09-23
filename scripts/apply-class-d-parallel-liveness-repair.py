#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SIGNATURE = 'TRUYN_CLASS_D_PARALLEL_LIVENESS_V1=1'


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def write(rel, text):
    (ROOT / rel).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)


def regex_once(text, pattern, replacement, label, flags=re.S):
    new, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return new


# --- Canonical provisioner: restore the Attempt-5 architecture invariant and
# remove the serial scale multipliers. Acceptance thresholds are untouched.
rel = 'benchmarks/scale/class-d-azure-1000-provision.sh'
s = read(rel)
if SIGNATURE in s:
    raise SystemExit('parallel-liveness repair already applied')

s = replace_once(
    s,
    'CLEANUP_CONFIRMED=false\nSTAGE=init\n',
    'CLEANUP_CONFIRMED=false\nSTAGE=init\nTRUYN_CLASS_D_PARALLEL_LIVENESS_V1=1\nsource "${GITHUB_WORKSPACE:-$PWD}/scripts/class-d-phase-watchdog.sh"\n',
    'provisioner-watchdog-source',
)

cleanup_old = '''  for vm in "${VMS[@]}"; do az vm delete -g "$RG" -n "$vm" --yes --force-deletion --only-show-errors >/dev/null 2>&1 || echo "TRUYN_CLASS_D_1000_CLEANUP_DELETE_FAILURE type=vm name=${vm}" >&2; done
  for nic in "${NICS[@]}"; do az network nic delete -g "$RG" -n "$nic" --only-show-errors >/dev/null 2>&1 || echo "TRUYN_CLASS_D_1000_CLEANUP_DELETE_FAILURE type=nic name=${nic}" >&2; done
  for disk in "${DISKS[@]}"; do az disk delete -g "$RG" -n "$disk" --yes --only-show-errors >/dev/null 2>&1 || echo "TRUYN_CLASS_D_1000_CLEANUP_DELETE_FAILURE type=disk name=${disk}" >&2; done
  az network vnet delete -g "$RG" -n "$VNET" --only-show-errors >/dev/null 2>&1 || echo "TRUYN_CLASS_D_1000_CLEANUP_DELETE_FAILURE type=vnet name=${VNET}" >&2
  az network nsg delete -g "$RG" -n "$NSG" --only-show-errors >/dev/null 2>&1 || echo "TRUYN_CLASS_D_1000_CLEANUP_DELETE_FAILURE type=nsg name=${NSG}" >&2
'''
cleanup_new = '''  cleanup_worker_rc=0
  (
    set +e
    trap 'jobs -pr | xargs -r kill -TERM >/dev/null 2>&1 || true' TERM INT EXIT
    wave=()
    for vm in "${VMS[@]}"; do
      (az vm delete -g "$RG" -n "$vm" --yes --force-deletion --only-show-errors >/dev/null 2>&1 || echo "TRUYN_CLASS_D_1000_CLEANUP_DELETE_FAILURE type=vm name=${vm}" >&2) & wave+=("$!")
    done
    wave_rc=0; for pid in "${wave[@]}"; do wait "$pid" || wave_rc=1; done
    wave=()
    for nic in "${NICS[@]}"; do (az network nic delete -g "$RG" -n "$nic" --only-show-errors >/dev/null 2>&1 || echo "TRUYN_CLASS_D_1000_CLEANUP_DELETE_FAILURE type=nic name=${nic}" >&2) & wave+=("$!"); done
    for disk in "${DISKS[@]}"; do (az disk delete -g "$RG" -n "$disk" --yes --only-show-errors >/dev/null 2>&1 || echo "TRUYN_CLASS_D_1000_CLEANUP_DELETE_FAILURE type=disk name=${disk}" >&2) & wave+=("$!"); done
    for pid in "${wave[@]}"; do wait "$pid" || wave_rc=1; done
    wave=()
    (az network vnet delete -g "$RG" -n "$VNET" --only-show-errors >/dev/null 2>&1 || echo "TRUYN_CLASS_D_1000_CLEANUP_DELETE_FAILURE type=vnet name=${VNET}" >&2) & wave+=("$!")
    (az network nsg delete -g "$RG" -n "$NSG" --only-show-errors >/dev/null 2>&1 || echo "TRUYN_CLASS_D_1000_CLEANUP_DELETE_FAILURE type=nsg name=${NSG}" >&2) & wave+=("$!")
    for pid in "${wave[@]}"; do wait "$pid" || wave_rc=1; done
    trap - TERM INT EXIT
    exit "$wave_rc"
  ) &
  cleanup_worker_pid=$!
  class_d_wait_pid_barrier cleanup "$cleanup_worker_pid" || cleanup_worker_rc=$?
  [[ "$cleanup_worker_rc" == 0 ]] || echo "TRUYN_CLASS_D_1000_CLEANUP_DEADLINE rc=${cleanup_worker_rc}" >&2
'''
s = replace_once(s, cleanup_old, cleanup_new, 'parallel-cleanup')

provision_pattern = r'''STAGE=provision\nfor i in \$\(seq 0 \$\(\(HOST_COUNT-1\)\)\); do\n.*?\n  PRIV\+=\("\$\(az network nic show -g "\$RG" -n "\$\{NICS\[\$i\]\}" --query 'ipConfigurations\[0\]\.privateIPAddress' -o tsv --only-show-errors\)"\)\n  \[\[ -n "\$\{PRIV\[\$i\]\}" \]\]\ndone\n\nSTAGE=install'''
provision_new = '''STAGE=provision
provision_dir=$(mktemp -d)
provision_pids=()
for i in $(seq 0 $((HOST_COUNT-1))); do
  (
    set -Eeuo pipefail
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
    priv="$(az network nic show -g "$RG" -n "${NICS[$i]}" --query 'ipConfigurations[0].privateIPAddress' -o tsv --only-show-errors)"
    [[ -n "$priv" ]]
    printf '%s\\n' "$priv" >"$provision_dir/$i.ip"
  ) >"$provision_dir/$i.log" 2>&1 &
  provision_pids+=("$!")
done
class_d_wait_pid_barrier provision "${provision_pids[@]}"
for i in $(seq 0 $((HOST_COUNT-1))); do
  cat "$provision_dir/$i.log"
  PRIV+=("$(cat "$provision_dir/$i.ip")")
done
rm -rf "$provision_dir"
[[ "${#PRIV[@]}" == "$HOST_COUNT" ]]

echo "TRUYN_CLASS_D_1000 stage=provision mode=parallel-hosts hosts=${HOST_COUNT}/${HOST_COUNT} status=PASS"

STAGE=install'''
s = regex_once(s, provision_pattern, provision_new, 'parallel-provision')

s = replace_once(
    s,
    'STAGE=install\nfor i in $(seq 0 $((HOST_COUNT-1))); do\n',
    'STAGE=install\ninstall_dir=$(mktemp -d)\ninstall_pids=()\nfor i in $(seq 0 $((HOST_COUNT-1))); do\n',
    'parallel-install-open',
)
install_tail_old = '''  out=$(remote "${VMS[$i]}" "$script")
  [[ "$(marker "$out" READY)" == "$NODES_PER_HOST" ]]
  echo "TRUYN_CLASS_D_1000 stage=install host=$i processes=${NODES_PER_HOST} identities=${NODES_PER_HOST} endpoints=${NODES_PER_HOST} status=PASS"
done

STAGE=bootstrap-record-refresh'''
install_tail_new = '''  (
    out=$(remote "${VMS[$i]}" "$script")
    [[ "$(marker "$out" READY)" == "$NODES_PER_HOST" ]]
    echo "TRUYN_CLASS_D_1000 stage=install host=$i processes=${NODES_PER_HOST} identities=${NODES_PER_HOST} endpoints=${NODES_PER_HOST} status=PASS"
  ) >"$install_dir/$i" 2>&1 &
  install_pids+=("$!")
done
class_d_wait_pid_barrier install "${install_pids[@]}"
for i in $(seq 0 $((HOST_COUNT-1))); do cat "$install_dir/$i"; done
rm -rf "$install_dir"
echo "TRUYN_CLASS_D_1000 stage=install mode=parallel-hosts hosts=${HOST_COUNT}/${HOST_COUNT} status=PASS"

STAGE=bootstrap-record-refresh'''
s = replace_once(s, install_tail_old, install_tail_new, 'parallel-install-close')

bootstrap_pattern = r'''min_records=999999\nmax_records=0\nmin_bytes=999999999\nmax_bytes=0\ntotal_bytes=0\nrefresh_count=0\nrefresh_min_valid=999999\nrefresh_max_valid=0\nrefresh_min_buckets=999999\nrefresh_max_buckets=0\nrefresh_min_endpoints=999999\nrefresh_max_endpoints=0\nrefresh_min_hosts=999999\nrefresh_max_hosts=0\nt0=\\\$\(date \+%s%3N\)\nfor j in .*?echo BOOTSTRAP_REFRESH_MAX_HOSTS=\\\$refresh_max_hosts'''
bootstrap_new = '''HOST_INDEX=${i} \\
NODES_PER_HOST=${NODES_PER_HOST} \\
CONTROL_BASE=${CONTROL_BASE} \\
BOOTSTRAP_MAX_PEERS_PER_NODE=${BOOTSTRAP_MAX_PEERS_PER_NODE} \\
BOOTSTRAP_PLAN_SEED='${GITHUB_SHA}' \\
BOOTSTRAP_REQUEST_TIMEOUT_S=90 \\
REFRESH_SERVER_TIMEOUT_MS=120000 \\
REFRESH_CLIENT_TIMEOUT_S=135 \\
REFRESH_ATTEMPTS=2 \\
/opt/truyn/app/benchmarks/scale/class-d-bootstrap-host.sh'''
s = regex_once(s, bootstrap_pattern, bootstrap_new, 'parallel-bootstrap-nodes')

s = replace_once(
    s,
    'for pid in "${bootstrap_pids[@]}"; do wait "$pid"; done\nfor i in $(seq 0 $((HOST_COUNT-1))); do cat "$bootstrap_dir/$i"; done\n',
    'class_d_wait_pid_barrier bootstrap "${bootstrap_pids[@]}"\nfor i in $(seq 0 $((HOST_COUNT-1))); do cat "$bootstrap_dir/$i"; done\n',
    'bootstrap-global-barrier',
)

s = replace_once(
    s,
    'targetConcurrency=4 serverDeadlineMs=240000 clientDeadlineMs=300000 status=PASS',
    'executionMode=parallel-nodes nodeConcurrency=${NODES_PER_HOST} targetConcurrency=4 serverDeadlineMs=120000 clientDeadlineMs=135000 status=PASS',
    'bootstrap-qualification-marker',
)

write(rel, s)

# D-500 hard outer watchdog: two hours. Template must carry the same invariant.
for rel in ['.github/workflows/d500-acceptance.yml', '.github/d500/d500-acceptance.template.yml']:
    s = read(rel)
    s = replace_once(s, 'timeout-minutes: 420', 'timeout-minutes: 120', rel + '-outer-watchdog')
    write(rel, s)

# Shared bootstrap qualification: D-500 <=2h, D-1000 <=4h.
rel = '.github/workflows/class-d-bootstrap-qualification.yml'
s = read(rel)
s = replace_once(s, '    timeout-minutes: 240\n', "    timeout-minutes: ${{ inputs.scale == 'd500' && 120 || 240 }}\n", 'bootstrap-job-watchdog')
s = replace_once(
    s,
    '          TRUYN_CLASS_D1000_NODES_PER_HOST="$NODES_PER_HOST" \\\n',
    '          TRUYN_CLASS_D1000_NODES_PER_HOST="$NODES_PER_HOST" \\\n          TRUYN_CLASS_D_SCALE="$SCALE" \\\n',
    'bootstrap-scale-env',
)
write(rel, s)

print('TRUYN_CLASS_D_PARALLEL_LIVENESS_REPAIR=APPLIED')
