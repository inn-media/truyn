#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-bootstrap-timeout.py <provisioner>')

path = Path(sys.argv[1])
text = path.read_text()
needle = "refresh_result=\\$(curl -fsS --max-time 120 -H 'content-type: application/json' --data-binary \"\\$refresh_payload\" \"\\${control_url}/dht/refresh\")"
replacement = """refresh_result=''
  refresh_rc=1
  for refresh_attempt in 1 2 3; do
    set +e
    refresh_result=\\$(curl -fsS --max-time 300 -H 'content-type: application/json' --data-binary \"\\$refresh_payload\" \"\\${control_url}/dht/refresh\")
    refresh_rc=\\$?
    set -e
    if [[ \"\\$refresh_rc\" -eq 0 ]]; then break; fi
    echo \"TRUYN_D200_BOOTSTRAP_REFRESH_RETRY host=${i} node=\\$j attempt=\\$refresh_attempt rc=\\$refresh_rc\" >&2
    [[ \"\\$refresh_attempt\" -lt 3 ]] && sleep \\$((refresh_attempt * 2))
  done
  [[ \"\\$refresh_rc\" -eq 0 ]]"""
count = text.count(needle)
if count != 1:
    raise SystemExit(f'unexpected diagnostic bootstrap refresh timeout occurrence count: {count}')
text = text.replace(needle, replacement)
path.write_text(text)
