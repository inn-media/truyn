#!/usr/bin/env python3
from pathlib import Path
import hashlib
import json
import re
import sys

if len(sys.argv) != 3:
    raise SystemExit('usage: summarize-class-d200-healed-origin.py <evidence-json> <digest-file>')

evidence_path = Path(sys.argv[1])
digest_path = Path(sys.argv[2])
if not evidence_path.is_file():
    raise SystemExit(f'evidence not found: {evidence_path}')
if not digest_path.is_file():
    raise SystemExit(f'digest not found: {digest_path}')

raw = evidence_path.read_bytes()
data = json.loads(raw)
transport = data.get('evidenceTransport')
if not isinstance(transport, dict):
    raise SystemExit('healed evidence transport missing')
payload_truncated = transport.get('payloadTruncated')
if not isinstance(payload_truncated, bool):
    raise SystemExit('payloadTruncated must be a boolean')

digest_line = digest_path.read_text().strip()
match = re.fullmatch(r'sha256:([0-9a-f]{64})', digest_line)
if not match:
    raise SystemExit('invalid healed evidence digest format')
actual = hashlib.sha256(raw).hexdigest()
digest_ok = actual == match.group(1)

counts = data.get('classificationCounts')
if not isinstance(counts, dict):
    counts = {}

def count(name):
    value = counts.get(name, 0)
    return int(value) if isinstance(value, int) and value >= 0 else 0

schema = data.get('schema')
failed = data.get('failureCount', 0)
if not isinstance(schema, str) or not schema:
    raise SystemExit('healed evidence schema missing')
if not isinstance(failed, int) or failed < 0:
    raise SystemExit('failureCount must be a non-negative integer')

sampled_warmed = 0
for failure in data.get('failures') or []:
    if isinstance(failure, dict) and failure.get('recordTransition') == 'became-valid-during-first-attempt':
        sampled_warmed += 1

rows = {
    'schema': schema,
    'failed': failed,
    'session': count('valid-record-session-reset-recovered'),
    'unverified': count('transport-reset-unverified-retry-recovered'),
    'valid_refresh': count('valid-record-target-refresh-recovered'),
    'stale_refresh': count('stale-record-target-refresh-recovered'),
    'missing_refresh': count('missing-record-target-refresh-recovered'),
    'unavailable_refresh': count('peer-state-unavailable-target-refresh-recovered'),
    'persistent': count('persistent-after-refresh'),
    'sampled_warmed': sampled_warmed,
    'payload_truncated': 'true' if payload_truncated else 'false',
    'digest_ok': 'true' if digest_ok else 'false',
}
for key, value in rows.items():
    print(f'{key}={value}')

if not digest_ok:
    raise SystemExit('healed evidence digest mismatch')
