#!/usr/bin/env python3
from pathlib import Path
import subprocess
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-composed-heal-evidence.py <campaign>')

target = Path(sys.argv[1])
if not target.is_file():
    raise SystemExit(f'campaign not found: {target}')

steps = [
    'scripts/patch-class-d-diagnostic-failure-evidence.py',
    'scripts/patch-class-d-diagnostic-packet-partition.py',
    'scripts/patch-class-d-diagnostic-healed-reconvergence.py',
]

for script in steps:
    run = subprocess.run([sys.executable, script, str(target)], text=True, capture_output=True)
    if run.returncode != 0:
        if run.stdout:
            sys.stderr.write(run.stdout)
        if run.stderr:
            sys.stderr.write(run.stderr)
        raise SystemExit(f'composed D-200 patch failed at {script} with exit {run.returncode}')

text = target.read_text()
required = {
    'universal failure checkpoint': 'd200_failure_evidence_checkpoint() {',
    'universal ERR trap': 'd200_err_trap() {',
    'packet heal diagnostics': 'PACKET_DIAG_PHASE=heal-timeout',
    'packet durable checkpoint': 'TRUYN_D200_FAILURE_EVIDENCE=CHECKPOINT stage=packet-partition',
    'healed reconvergence classifier': 'HEALED_DIAG_B64=',
    'healed diagnostic artifact': 'class-d-200-healed-reconvergence.json',
    'strict healed acceptance': "assert float('$healed_rate') >= .99, '$healed_rate'",
}
for label, marker in required.items():
    if marker not in text:
        raise SystemExit(f'composed D-200 patch missing {label}')

if text.count('d200_failure_evidence_checkpoint() {') != 1:
    raise SystemExit('unexpected universal failure checkpoint helper count after composition')
if text.count('d200_err_trap() {') != 1:
    raise SystemExit('unexpected universal ERR helper count after composition')

print('TRUYN_D200_COMPOSED_PATCH=PASS order=failure-evidence,packet-partition,healed-reconvergence')
