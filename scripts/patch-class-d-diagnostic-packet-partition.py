#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-packet-partition.py <campaign>')

path = Path(sys.argv[1])
text = path.read_text()

start_marker = 'STAGE=packet-partition\n'
end_marker = 'STAGE=healed-routing\n'
if text.count(start_marker) != 1:
    raise SystemExit(f'unexpected packet-partition stage count: {text.count(start_marker)}')
if text.count(end_marker) != 1:
    raise SystemExit(f'unexpected healed-routing stage count: {text.count(end_marker)}')

start = text.index(start_marker)
end = text.index(end_marker)
block = text[start:end]

required = {
    'real packet DROP': "iptables -I OUTPUT 1 -p udp -d '${block_ip}'",
    'real packet heal': "iptables -D OUTPUT -p udp -d '${block_ip}'",
    'blocked-success gate': '[[ "$partition_successes" == 0 ]]',
    'heal retry count': 'for n in $(seq 1 90); do',
    'heal probe': "curl -sS --max-time 6 -o /tmp/d1000-heal -w '%{http_code}'",
    'heal success gate': '[[ "$(marker "$out" HEAL_CODE)" == 200 ]]',
    'recovery gate': '[[ "$partition_recovery_ms" -le 120000 ]]',
}
if 'PACKET_DIAG_PHASE=heal-timeout' in block:
    raise SystemExit('packet-partition block already appears patched')
for label, snippet in required.items():
    if block.count(snippet) != 1:
        raise SystemExit(f'unexpected {label} count: {block.count(snippet)}')

old = '''[[ "$(marker "$out" HEAL_CODE)" == 200 ]]
partition_recovery_ms=$(( $(date +%s%3N) - heal_start ))
'''
if block.count(old) != 1:
    raise SystemExit(f'unexpected heal terminal count: {block.count(old)}')

new = r'''heal_code=$(marker "$out" HEAL_CODE)
if [[ "$heal_code" != 200 ]]; then
  packet_partition_diag=$(remote "${VMS[0]}" "set +e; echo PACKET_DIAG_PHASE=heal-timeout; echo PACKET_DIAG_PROCESS_COUNT=\$(pgrep -fc 'network/testnet/node-service.js'); echo PACKET_DIAG_PARTITION_RULES_BEGIN; iptables-save | grep 'truyn-d1000-partition' || true; echo PACKET_DIAG_PARTITION_RULES_END; echo PACKET_DIAG_CONTROL_LISTENERS_BEGIN; ss -ltnp | grep -E '127\.0\.0\.1:(${CONTROL_BASE}|$((CONTROL_BASE+1))|$((CONTROL_BASE+2))|$((CONTROL_BASE+3))|$((CONTROL_BASE+4)))' || true; echo PACKET_DIAG_CONTROL_LISTENERS_END; echo PACKET_DIAG_QUIC_LISTENERS_BEGIN; ss -lunp | grep -E ':(${QUIC_BASE}|$((QUIC_BASE+1))|$((QUIC_BASE+2))|$((QUIC_BASE+3))|$((QUIC_BASE+4)))' || true; echo PACKET_DIAG_QUIC_LISTENERS_END; for j in \$(seq 0 4); do idx=\$j; unit=truyn-d1000@\${idx}.service; echo PACKET_DIAG_UNIT_BEGIN=\$unit; systemctl show \"\$unit\" --no-pager -p ActiveState -p SubState -p Result -p MainPID -p NRestarts -p ExecMainCode -p ExecMainStatus -p StateChangeTimestamp; journalctl -u \"\$unit\" -n 40 --no-pager -o short-iso || true; echo PACKET_DIAG_UNIT_END=\$unit; done")
  printf '%s\n' "$packet_partition_diag"
fi
[[ "$heal_code" == 200 ]]
partition_recovery_ms=$(( $(date +%s%3N) - heal_start ))
'''

block = block.replace(old, new)
text = text[:start] + block + text[end:]
path.write_text(text)
