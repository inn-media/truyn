#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit("usage: prepare-class-d-diagnostic-provision.py <provision.sh>")

path = Path(sys.argv[1])
text = path.read_text()

loop_open = '''STAGE=bootstrap
IPS_JSON=$(printf '%s\\n' "${PRIV[@]}" | jq -R . | jq -s -c .)
for i in $(seq 0 $((HOST_COUNT-1))); do
'''
parallel_open = '''STAGE=bootstrap
IPS_JSON=$(printf '%s\\n' "${PRIV[@]}" | jq -R . | jq -s -c .)
bootstrap_dir=$(mktemp -d)
bootstrap_pids=()
for i in $(seq 0 $((HOST_COUNT-1))); do
'''

serial_tail = '''  out=$(remote "${VMS[$i]}" "$script")
  [[ "$(marker "$out" BOOTSTRAP_PLAN_MIN_RECORDS)" == "$BOOTSTRAP_MAX_PEERS_PER_NODE" ]]
  [[ "$(marker "$out" BOOTSTRAP_PLAN_MAX_RECORDS)" == "$BOOTSTRAP_MAX_PEERS_PER_NODE" ]]
  [[ "$(marker "$out" BOOTSTRAP_PLAN_ALL_TO_ALL)" == false ]]
  [[ "$(marker "$out" BOOTSTRAP_REFRESH_COUNT)" == "$NODES_PER_HOST" ]]
  [[ "$(marker "$out" BOOTSTRAP_REFRESH_STATUS)" == refreshed ]]
  echo "TRUYN_CLASS_D_1000 stage=bootstrap host=$i plan=per-node-xor refresh=per-node recordsMin=$(marker "$out" BOOTSTRAP_PLAN_MIN_RECORDS) recordsMax=$(marker "$out" BOOTSTRAP_PLAN_MAX_RECORDS) refreshCount=$(marker "$out" BOOTSTRAP_REFRESH_COUNT) validMin=$(marker "$out" BOOTSTRAP_REFRESH_MIN_VALID) validMax=$(marker "$out" BOOTSTRAP_REFRESH_MAX_VALID) bucketsMin=$(marker "$out" BOOTSTRAP_REFRESH_MIN_BUCKETS) bucketsMax=$(marker "$out" BOOTSTRAP_REFRESH_MAX_BUCKETS) endpointsMin=$(marker "$out" BOOTSTRAP_REFRESH_MIN_ENDPOINTS) endpointsMax=$(marker "$out" BOOTSTRAP_REFRESH_MAX_ENDPOINTS) hostsMin=$(marker "$out" BOOTSTRAP_REFRESH_MIN_HOSTS) hostsMax=$(marker "$out" BOOTSTRAP_REFRESH_MAX_HOSTS) bytesMin=$(marker "$out" BOOTSTRAP_MIN_BYTES) bytesMax=$(marker "$out" BOOTSTRAP_MAX_BYTES) bytesMean=$(marker "$out" BOOTSTRAP_MEAN_BYTES) ms=$(marker "$out" BOOTSTRAP_MS)"
done

STAGE=bandwidth-meter
'''

parallel_tail = '''  (remote "${VMS[$i]}" "$script" >"$bootstrap_dir/$i") &
  bootstrap_pids+=("$!")
done
for pid in "${bootstrap_pids[@]}"; do wait "$pid"; done
for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$bootstrap_dir/$i")"
  [[ "$(marker "$out" BOOTSTRAP_PLAN_MIN_RECORDS)" == "$BOOTSTRAP_MAX_PEERS_PER_NODE" ]]
  [[ "$(marker "$out" BOOTSTRAP_PLAN_MAX_RECORDS)" == "$BOOTSTRAP_MAX_PEERS_PER_NODE" ]]
  [[ "$(marker "$out" BOOTSTRAP_PLAN_ALL_TO_ALL)" == false ]]
  [[ "$(marker "$out" BOOTSTRAP_REFRESH_COUNT)" == "$NODES_PER_HOST" ]]
  [[ "$(marker "$out" BOOTSTRAP_REFRESH_STATUS)" == refreshed ]]
  echo "TRUYN_CLASS_D_1000 stage=bootstrap host=$i mode=parallel-hosts plan=per-node-xor refresh=per-node recordsMin=$(marker "$out" BOOTSTRAP_PLAN_MIN_RECORDS) recordsMax=$(marker "$out" BOOTSTRAP_PLAN_MAX_RECORDS) refreshCount=$(marker "$out" BOOTSTRAP_REFRESH_COUNT) validMin=$(marker "$out" BOOTSTRAP_REFRESH_MIN_VALID) validMax=$(marker "$out" BOOTSTRAP_REFRESH_MAX_VALID) bucketsMin=$(marker "$out" BOOTSTRAP_REFRESH_MIN_BUCKETS) bucketsMax=$(marker "$out" BOOTSTRAP_REFRESH_MAX_BUCKETS) endpointsMin=$(marker "$out" BOOTSTRAP_REFRESH_MIN_ENDPOINTS) endpointsMax=$(marker "$out" BOOTSTRAP_REFRESH_MAX_ENDPOINTS) hostsMin=$(marker "$out" BOOTSTRAP_REFRESH_MIN_HOSTS) hostsMax=$(marker "$out" BOOTSTRAP_REFRESH_MAX_HOSTS) bytesMin=$(marker "$out" BOOTSTRAP_MIN_BYTES) bytesMax=$(marker "$out" BOOTSTRAP_MAX_BYTES) bytesMean=$(marker "$out" BOOTSTRAP_MEAN_BYTES) ms=$(marker "$out" BOOTSTRAP_MS)"
done
rm -rf "$bootstrap_dir"

STAGE=bandwidth-meter
'''

if text.count(loop_open) != 1:
    raise SystemExit("unexpected bootstrap loop marker count")
if text.count(serial_tail) != 1:
    raise SystemExit("unexpected serial bootstrap tail count")

text = text.replace(loop_open, parallel_open, 1).replace(serial_tail, parallel_tail, 1)
path.write_text(text)
