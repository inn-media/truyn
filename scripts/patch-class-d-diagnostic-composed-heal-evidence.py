#!/usr/bin/env python3
from pathlib import Path
import subprocess
import sys

if len(sys.argv) != 3:
    raise SystemExit('usage: patch-class-d-diagnostic-composed-heal-evidence.py <provision> <campaign>')

provision = Path(sys.argv[1])
campaign = Path(sys.argv[2])
for label, target in [('provision', provision), ('campaign', campaign)]:
    if not target.is_file():
        raise SystemExit(f'{label} not found: {target}')

steps = [
    ('scripts/patch-class-d-diagnostic-failure-evidence.py', provision),
    ('scripts/patch-class-d-diagnostic-packet-partition.py', campaign),
    ('scripts/patch-class-d-diagnostic-healed-reconvergence.py', campaign),
]

for script, target in steps:
    run = subprocess.run([sys.executable, script, str(target)], text=True, capture_output=True)
    if run.returncode != 0:
        if run.stdout:
            sys.stderr.write(run.stdout)
        if run.stderr:
            sys.stderr.write(run.stderr)
        raise SystemExit(f'composed D-200 patch failed at {script} with exit {run.returncode}')

provision_text = provision.read_text()
campaign_text = campaign.read_text()
provision_required = {
    'universal failure checkpoint': 'd200_failure_evidence_checkpoint() {',
    'universal ERR trap': 'd200_err_trap() {',
}
campaign_required = {
    'packet heal diagnostics': 'PACKET_DIAG_PHASE=heal-timeout',
    'packet durable checkpoint': 'TRUYN_D200_FAILURE_EVIDENCE=CHECKPOINT stage=packet-partition',
    'healed reconvergence classifier': 'HEALED_DIAG_B64=',
    'healed diagnostic artifact': 'class-d-200-healed-reconvergence.json',
    'strict healed acceptance': "assert float('$healed_rate') >= .99, '$healed_rate'",
}
for label, marker in provision_required.items():
    if marker not in provision_text:
        raise SystemExit(f'composed D-200 patch missing {label}')
for label, marker in campaign_required.items():
    if marker not in campaign_text:
        raise SystemExit(f'composed D-200 patch missing {label}')

if provision_text.count('d200_failure_evidence_checkpoint() {') != 1:
    raise SystemExit('unexpected universal failure checkpoint helper count after composition')
if provision_text.count('d200_err_trap() {') != 1:
    raise SystemExit('unexpected universal ERR helper count after composition')

print('TRUYN_D200_COMPOSED_PATCH=PASS order=failure-evidence,packet-partition,healed-reconvergence')
