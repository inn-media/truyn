#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-local-fault-control.py <provision>')

path = Path(sys.argv[1])
text = path.read_text()
marker = 'TRUYN_TESTNET_FAULT_CONTROL=1'
if marker in text:
    raise SystemExit('diagnostic local fault control already appears enabled')

anchor = 'TRUYN_DHT_RPC_TIMEOUT_MS=5000\nENV\n'
if text.count(anchor) != 1:
    raise SystemExit(f'unexpected D-1000 node env anchor count: {text.count(anchor)}')

text = text.replace(anchor, 'TRUYN_DHT_RPC_TIMEOUT_MS=5000\nTRUYN_TESTNET_FAULT_CONTROL=1\nENV\n')
if text.count(marker) != 1:
    raise SystemExit('failed to install exactly one diagnostic local fault-control setting')
if 'TRUYN_CONTROL_HOST=127.0.0.1' not in text:
    raise SystemExit('diagnostic fault control must remain bound to localhost control plane')

path.write_text(text)
