#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 3:
    raise SystemExit('usage: patch-d200-recovery-budget.py <runtime.js> <provision.sh>')

runtime_path = Path(sys.argv[1])
provision_path = Path(sys.argv[2])
runtime = runtime_path.read_text()
provision = provision_path.read_text()

old_delays = 'this.peerRecordRecoveryRetryDelaysMs = [1_000, 3_000, 10_000, 30_000, 45_000];'
new_delays = 'this.peerRecordRecoveryRetryDelaysMs = [500, 1_500, 5_000, 10_000, 20_000];'
if runtime.count(old_delays) != 1:
    raise SystemExit(f'unexpected peer-record recovery retry schedule count: {runtime.count(old_delays)}')
if new_delays in runtime:
    raise SystemExit('peer-record recovery retry schedule already patched')

unit_anchor = 'Restart=on-failure\nRestartSec=1\nLimitNOFILE=65536'
unit_replacement = 'Restart=on-failure\nRestartSec=1\nTimeoutStopSec=15s\nLimitNOFILE=65536'
if provision.count(unit_anchor) != 1:
    raise SystemExit(f'unexpected systemd restart unit anchor count: {provision.count(unit_anchor)}')
if 'TimeoutStopSec=' in provision:
    raise SystemExit('systemd stop timeout already present')

runtime_path.write_text(runtime.replace(old_delays, new_delays, 1))
provision_path.write_text(provision.replace(unit_anchor, unit_replacement, 1))
