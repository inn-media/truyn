#!/usr/bin/env python3
from pathlib import Path
import re
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-bootstrap-timeout.py <provisioner>')

path = Path(sys.argv[1])
text = path.read_text()
needle = "refresh_result=\\$(curl -fsS --max-time 120 -H 'content-type: application/json' --data-binary \"\\$refresh_payload\" \"\\${control_url}/dht/refresh\")"
replacement = "refresh_result=\\$(curl -fsS --max-time 300 -H 'content-type: application/json' --data-binary \"\\$refresh_payload\" \"\\${control_url}/dht/refresh\")"
count = text.count(needle)
if count != 1:
    raise SystemExit(f'unexpected diagnostic bootstrap refresh timeout occurrence count: {count}')
text = text.replace(needle, replacement)
path.write_text(text)
