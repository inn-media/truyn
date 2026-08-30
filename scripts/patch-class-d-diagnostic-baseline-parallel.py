#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-baseline-parallel.py <campaign>')

path = Path(sys.argv[1])
text = path.read_text()

head = '''STAGE=baseline-routing
base_success=0; base_total=0; base_p50=0; base_p90=0; base_p95=0; base_p99=0
for i in $(seq 0 $((HOST_COUNT-1))); do
'''
head_replacement = '''STAGE=baseline-routing
base_success=0; base_total=0; base_p50=0; base_p90=0; base_p95=0; base_p99=0
baseline_dir=$(mktemp -d)
baseline_pids=()
for i in $(seq 0 $((HOST_COUNT-1))); do
'''
if text.count(head) != 1:
    raise SystemExit(f'unexpected baseline loop head count: {text.count(head)}')
text = text.replace(head, head_replacement, 1)

tail = '''  out=$(remote "${VMS[$i]}" "$script")
  ok=$(marker "$out" BASE_OK); total=$(marker "$out" BASE_TOTAL); p50=$(marker "$out" BASE_P50); p90=$(marker "$out" BASE_P90); p95=$(marker "$out" BASE_P95); p99=$(marker "$out" BASE_P99)
  base_success=$((base_success+ok)); base_total=$((base_total+total))
  base_p50=$(python3 -c "print(max(float('$base_p50'),float('$p50')))" ); base_p90=$(python3 -c "print(max(float('$base_p90'),float('$p90')))" )
  base_p95=$(python3 -c "print(max(float('$base_p95'),float('$p95')))" ); base_p99=$(python3 -c "print(max(float('$base_p99'),float('$p99')))" )
done
base_rate=$(python3 -c "print(round($base_success/$base_total,6))")
'''
replacement = '''  (remote "${VMS[$i]}" "$script" >"$baseline_dir/$i") &
  baseline_pids+=("$!")
done
baseline_failed=0
for pid in "${baseline_pids[@]}"; do
  if ! wait "$pid"; then baseline_failed=1; fi
done
if [[ "$baseline_failed" != 0 ]]; then
  rm -rf "$baseline_dir"
  false
fi
for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$baseline_dir/$i")"
  ok=$(marker "$out" BASE_OK); total=$(marker "$out" BASE_TOTAL); p50=$(marker "$out" BASE_P50); p90=$(marker "$out" BASE_P90); p95=$(marker "$out" BASE_P95); p99=$(marker "$out" BASE_P99)
  base_success=$((base_success+ok)); base_total=$((base_total+total))
  base_p50=$(python3 -c "print(max(float('$base_p50'),float('$p50')))" ); base_p90=$(python3 -c "print(max(float('$base_p90'),float('$p90')))" )
  base_p95=$(python3 -c "print(max(float('$base_p95'),float('$p95')))" ); base_p99=$(python3 -c "print(max(float('$base_p99'),float('$p99')))" )
  echo "TRUYN_CLASS_D_1000 stage=baseline host=$i mode=parallel-hosts success=${ok}/${total} p50Ms=${p50} p90Ms=${p90} p95Ms=${p95} p99Ms=${p99}"
done
rm -rf "$baseline_dir"
base_rate=$(python3 -c "print(round($base_success/$base_total,6))")
'''
if text.count(tail) != 1:
    raise SystemExit(f'unexpected baseline loop tail count: {text.count(tail)}')
text = text.replace(tail, replacement, 1)
path.write_text(text)
