#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-readiness-parallel.py <campaign>')

path = Path(sys.argv[1])
text = path.read_text()

head = '''readiness_min_hosts=999999; readiness_max_hosts=0
readiness_start_ms=$(date +%s%3N)
for i in $(seq 0 $((HOST_COUNT-1))); do
'''
head_replacement = '''readiness_min_hosts=999999; readiness_max_hosts=0
readiness_dir=$(mktemp -d)
readiness_pids=()
readiness_start_ms=$(date +%s%3N)
for i in $(seq 0 $((HOST_COUNT-1))); do
'''
if text.count(head) != 1:
    raise SystemExit(f'unexpected readiness loop head count: {text.count(head)}')
text = text.replace(head, head_replacement, 1)

tail = '''  out=$(remote "${VMS[$i]}" "$script")
  ready=$(marker "$out" READINESS_READY); total=$(marker "$out" READINESS_TOTAL)
  [[ "$ready" == "$NODES_PER_HOST" ]]
  [[ "$total" == "$NODES_PER_HOST" ]]
  readiness_ready=$((readiness_ready+ready)); readiness_total=$((readiness_total+total))
  min_valid=$(marker "$out" READINESS_MIN_VALID); max_valid=$(marker "$out" READINESS_MAX_VALID)
  min_buckets=$(marker "$out" READINESS_MIN_BUCKETS); max_buckets=$(marker "$out" READINESS_MAX_BUCKETS)
  min_hosts=$(marker "$out" READINESS_MIN_HOSTS); max_hosts=$(marker "$out" READINESS_MAX_HOSTS)
  if [[ "$min_valid" -lt "$readiness_min_valid" ]]; then readiness_min_valid="$min_valid"; fi
  if [[ "$max_valid" -gt "$readiness_max_valid" ]]; then readiness_max_valid="$max_valid"; fi
  if [[ "$min_buckets" -lt "$readiness_min_buckets" ]]; then readiness_min_buckets="$min_buckets"; fi
  if [[ "$max_buckets" -gt "$readiness_max_buckets" ]]; then readiness_max_buckets="$max_buckets"; fi
  if [[ "$min_hosts" -lt "$readiness_min_hosts" ]]; then readiness_min_hosts="$min_hosts"; fi
  if [[ "$max_hosts" -gt "$readiness_max_hosts" ]]; then readiness_max_hosts="$max_hosts"; fi
  echo "TRUYN_CLASS_D_1000 stage=readiness-barrier host=$i ready=${ready}/${total} validMin=${min_valid} validMax=${max_valid} bucketsMin=${min_buckets} bucketsMax=${max_buckets} remoteHostsMin=${min_hosts} remoteHostsMax=${max_hosts} status=PASS"
done
readiness_ms=$(( $(date +%s%3N) - readiness_start_ms ))
'''
replacement = '''  (remote "${VMS[$i]}" "$script" >"$readiness_dir/$i") &
  readiness_pids+=("$!")
done
readiness_failed=0
for pid in "${readiness_pids[@]}"; do
  if ! wait "$pid"; then readiness_failed=1; fi
done
if [[ "$readiness_failed" != 0 ]]; then
  rm -rf "$readiness_dir"
  false
fi
for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$readiness_dir/$i")"
  ready=$(marker "$out" READINESS_READY); total=$(marker "$out" READINESS_TOTAL)
  [[ "$ready" == "$NODES_PER_HOST" ]]
  [[ "$total" == "$NODES_PER_HOST" ]]
  readiness_ready=$((readiness_ready+ready)); readiness_total=$((readiness_total+total))
  min_valid=$(marker "$out" READINESS_MIN_VALID); max_valid=$(marker "$out" READINESS_MAX_VALID)
  min_buckets=$(marker "$out" READINESS_MIN_BUCKETS); max_buckets=$(marker "$out" READINESS_MAX_BUCKETS)
  min_hosts=$(marker "$out" READINESS_MIN_HOSTS); max_hosts=$(marker "$out" READINESS_MAX_HOSTS)
  if [[ "$min_valid" -lt "$readiness_min_valid" ]]; then readiness_min_valid="$min_valid"; fi
  if [[ "$max_valid" -gt "$readiness_max_valid" ]]; then readiness_max_valid="$max_valid"; fi
  if [[ "$min_buckets" -lt "$readiness_min_buckets" ]]; then readiness_min_buckets="$min_buckets"; fi
  if [[ "$max_buckets" -gt "$readiness_max_buckets" ]]; then readiness_max_buckets="$max_buckets"; fi
  if [[ "$min_hosts" -lt "$readiness_min_hosts" ]]; then readiness_min_hosts="$min_hosts"; fi
  if [[ "$max_hosts" -gt "$readiness_max_hosts" ]]; then readiness_max_hosts="$max_hosts"; fi
  echo "TRUYN_CLASS_D_1000 stage=readiness-barrier host=$i mode=parallel-hosts ready=${ready}/${total} validMin=${min_valid} validMax=${max_valid} bucketsMin=${min_buckets} bucketsMax=${max_buckets} remoteHostsMin=${min_hosts} remoteHostsMax=${max_hosts} status=PASS"
done
rm -rf "$readiness_dir"
readiness_ms=$(( $(date +%s%3N) - readiness_start_ms ))
'''
if text.count(tail) != 1:
    raise SystemExit(f'unexpected readiness loop tail count: {text.count(tail)}')
text = text.replace(tail, replacement, 1)
path.write_text(text)
