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
    ('scripts/patch-class-d-diagnostic-local-fault-control.py', provision),
    ('scripts/patch-class-d-diagnostic-failure-evidence.py', provision),
    ('scripts/patch-class-d-diagnostic-packet-partition.py', campaign),
    ('scripts/patch-class-d-diagnostic-healed-reconvergence.py', campaign),
    ('scripts/patch-class-d-diagnostic-healed-origin.py', campaign),
    ('scripts/patch-class-d-diagnostic-healed-evidence-transport.py', campaign),
    ('scripts/patch-class-d-diagnostic-write-retention.py', campaign),
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
    'localhost control plane': 'TRUYN_CONTROL_HOST=127.0.0.1',
    'diagnostic local fault control': 'TRUYN_TESTNET_FAULT_CONTROL=1',
    'universal failure checkpoint': 'd200_failure_evidence_checkpoint() {',
    'universal ERR trap': 'd200_err_trap() {',
}
campaign_required = {
    'packet heal diagnostics': 'PACKET_DIAG_PHASE=heal-timeout',
    'packet durable checkpoint': 'TRUYN_D200_FAILURE_EVIDENCE=CHECKPOINT stage=packet-partition',
    'bounded healed evidence transport': 'D200_HEALED_EVIDENCE_TRANSPORT=1',
    'healed diagnostic chunks': 'HEALED_DIAG_CHUNK_',
    'healed diagnostic transport footer': 'HEALED_DIAG_META=',
    'healed diagnostic truncation guard': 'TRUYN_D200_HEALED_PAYLOAD_TRUNCATED',
    'healed diagnostic artifact': 'class-d-200-healed-reconvergence.json',
    'healed diagnostic artifact digest': 'class-d-200-healed-reconvergence-digest.txt',
    'peer-record origin capture': 'persisted_peer_state(j,node_id)',
    'forced target transport reset': "control+'/faults/partition'",
    'healed diagnostic schema v3': "'schema':'truyn.d200.healed-reconvergence.v3'",
    'healed evidence transport schema': "'schema':'truyn.d200.healed-evidence-transport.v1'",
    'durable write TTL covering full campaign': 'd200_durable_write_ttl_ms=21600000',
    'retention window precheck': 'TRUYN_D200_WRITE_RETENTION_WINDOW_INVALID phase=before-check',
    'retention window postcheck': 'TRUYN_D200_WRITE_RETENTION_WINDOW_INVALID phase=after-check',
    'strict healed acceptance': "assert float('$healed_rate') >= .99, '$healed_rate'",
    'strict acknowledged write retention': '[[ "$ack_loss" == 0 ]]',
}
for label, marker in provision_required.items():
    if marker not in provision_text:
        raise SystemExit(f'composed D-200 patch missing {label}')
for label, marker in campaign_required.items():
    if marker not in campaign_text:
        raise SystemExit(f'composed D-200 patch missing {label}')

if provision_text.count('TRUYN_TESTNET_FAULT_CONTROL=1') != 1:
    raise SystemExit('unexpected diagnostic local fault-control setting count after composition')
if provision_text.count('d200_failure_evidence_checkpoint() {') != 1:
    raise SystemExit('unexpected universal failure checkpoint helper count after composition')
if provision_text.count('d200_err_trap() {') != 1:
    raise SystemExit('unexpected universal ERR helper count after composition')
if campaign_text.count('d200_durable_write_ttl_ms=21600000') != 1:
    raise SystemExit('unexpected diagnostic durable write TTL setting count after composition')
for forbidden in [
    'd1000-healed-fresh-session-retry',
    'HEALED_DIAG_B64=',
    "'result':value",
    "'schema':'truyn.d200.healed-reconvergence.v2'",
]:
    if forbidden in campaign_text:
        raise SystemExit(f'unsafe healed diagnostic marker remained after composition: {forbidden}')

print('TRUYN_D200_COMPOSED_PATCH=PASS order=local-fault-control,failure-evidence,packet-partition,healed-reconvergence,healed-origin,bounded-evidence-transport,write-retention-window')
