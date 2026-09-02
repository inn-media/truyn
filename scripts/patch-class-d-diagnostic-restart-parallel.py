#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-restart-parallel.py <campaign>')

path = Path(sys.argv[1])
text = path.read_text()

start_marker = 'STAGE=restart-recovery\n'
end_marker = 'STAGE=post-restart-routing\n'
if text.count(start_marker) != 1:
    raise SystemExit(f'unexpected restart stage count: {text.count(start_marker)}')
if text.count(end_marker) != 1:
    raise SystemExit(f'unexpected post-restart stage count: {text.count(end_marker)}')

start = text.index(start_marker)
end = text.index(end_marker)
block = text[start:end]

required = {
    'restart directory': 'restart_dir=$(mktemp -d)',
    'restart timer': 't0=\\$(date +%s%3N)',
    'recovery gate': "assert float('$recovery_p95') <= 120000, '$recovery_p95'",
    'restart cardinality marker': 'restarted=100',
}
if 'stop_pids+=(' in block or 'STOP_MS=' in block:
    raise SystemExit('restart block already appears patched')
for label, snippet in required.items():
    if block.count(snippet) != 1:
        raise SystemExit(f'unexpected {label} count: {block.count(snippet)}')
if block.count('seq 10 14') != 3:
    raise SystemExit(f'unexpected restart node-range count: {block.count("seq 10 14")}')

replacement = r'''STAGE=restart-recovery
restart_dir=$(mktemp -d)
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
t0=\$(date +%s%3N)
stop_pids=()
for j in \$(seq 10 14); do
  idx=\$(( ${i} * ${NODES_PER_HOST} + j ))
  systemctl stop truyn-d1000@\${idx}.service &
  stop_pids+=("\$!")
done
stop_failed=0
for pid in "\${stop_pids[@]}"; do
  if ! wait "\$pid"; then stop_failed=1; fi
done
[[ "\$stop_failed" == 0 ]]
t_stop=\$(date +%s%3N)
stop_ms=\$((t_stop-t0))
sleep 2
t_start0=\$(date +%s%3N)
start_pids=()
for j in \$(seq 10 14); do
  idx=\$(( ${i} * ${NODES_PER_HOST} + j ))
  systemctl start truyn-d1000@\${idx}.service &
  start_pids+=("\$!")
done
start_failed=0
for pid in "\${start_pids[@]}"; do
  if ! wait "\$pid"; then start_failed=1; fi
done
[[ "\$start_failed" == 0 ]]
t_start=\$(date +%s%3N)
start_ms=\$((t_start-t_start0))
t_ready0=\$(date +%s%3N)
for n in \$(seq 1 90); do
  good=0
  for j in \$(seq 10 14); do
    curl -fsS --max-time 1 http://127.0.0.1:\$(( ${CONTROL_BASE}+j ))/status >/dev/null 2>&1 && good=\$((good+1))
  done
  [[ \$good -eq 5 ]] && break
  sleep 1
done
[[ \$good -eq 5 ]]
t1=\$(date +%s%3N)
ready_ms=\$((t1-t_ready0))
restart_ms=\$((t1-t0))
echo STOP_MS=\$stop_ms
echo START_MS=\$start_ms
echo READY_MS=\$ready_ms
echo RESTART_MS=\$restart_ms
EOS
)
  (remote "${VMS[$i]}" "$script" >"$restart_dir/$i") &
done
wait
stop_values=()
start_values=()
ready_values=()
recovery_values=()
for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$restart_dir/$i")"
  stop_ms=$(printf '%s\n' "$out" | sed -n 's/^STOP_MS=//p' | tail -1); [[ -n "$stop_ms" ]]; stop_values+=("$stop_ms")
  start_ms=$(printf '%s\n' "$out" | sed -n 's/^START_MS=//p' | tail -1); [[ -n "$start_ms" ]]; start_values+=("$start_ms")
  ready_ms=$(printf '%s\n' "$out" | sed -n 's/^READY_MS=//p' | tail -1); [[ -n "$ready_ms" ]]; ready_values+=("$ready_ms")
  restart_ms=$(printf '%s\n' "$out" | sed -n 's/^RESTART_MS=//p' | tail -1); [[ -n "$restart_ms" ]]; recovery_values+=("$restart_ms")
  echo "TRUYN_CLASS_D_1000 stage=restart-recovery host=$i mode=parallel-node-restart stopMs=${stop_ms} startMs=${start_ms} readyMs=${ready_ms} restartMs=${restart_ms}"
done
rm -rf "$restart_dir"
stop_p95=$(printf '%s\n' "${stop_values[@]}" | python3 -c 'import sys; a=sorted(float(x) for x in sys.stdin if x.strip()); print(a[min(len(a)-1,int((len(a)-1)*.95))])')
start_p95=$(printf '%s\n' "${start_values[@]}" | python3 -c 'import sys; a=sorted(float(x) for x in sys.stdin if x.strip()); print(a[min(len(a)-1,int((len(a)-1)*.95))])')
ready_p95=$(printf '%s\n' "${ready_values[@]}" | python3 -c 'import sys; a=sorted(float(x) for x in sys.stdin if x.strip()); print(a[min(len(a)-1,int((len(a)-1)*.95))])')
recovery_p95=$(printf '%s\n' "${recovery_values[@]}" | python3 -c 'import sys; a=sorted(float(x) for x in sys.stdin if x.strip()); print(a[min(len(a)-1,int((len(a)-1)*.95))])')
python3 - <<PY
assert float('$recovery_p95') <= 120000, '$recovery_p95'
PY
echo "TRUYN_CLASS_D_1000 stage=restart-recovery restarted=100 mode=parallel-node-restart stopP95Ms=${stop_p95} startP95Ms=${start_p95} readyP95Ms=${ready_p95} recoveryP95Ms=${recovery_p95} status=PASS"

'''

text = text[:start] + replacement + text[end:]
path.write_text(text)
