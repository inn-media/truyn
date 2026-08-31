#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-bandwidth-meter-parallel.py <provisioner>')

path = Path(sys.argv[1])
text = path.read_text()

block = '''STAGE=bandwidth-meter
for i in $(seq 0 $((HOST_COUNT-1))); do
  remote "${VMS[$i]}" "iptables -I OUTPUT 1 -p udp --dport ${QUIC_BASE}:$((QUIC_BASE+NODES_PER_HOST-1)) -m comment --comment truyn-d1000-meter-out -j ACCEPT; iptables -I INPUT 1 -p udp --sport ${QUIC_BASE}:$((QUIC_BASE+NODES_PER_HOST-1)) -m comment --comment truyn-d1000-meter-in -j ACCEPT; echo METER=1" >/dev/null
done'''

replacement = '''STAGE=bandwidth-meter
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
rm -rf "$meter_dir"'''

if text.count(block) != 1:
    raise SystemExit(f'unexpected bandwidth-meter block count: {text.count(block)}')

path.write_text(text.replace(block, replacement, 1))
