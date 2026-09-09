#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-readiness-transport.py <campaign>')

path = Path(sys.argv[1])
text = path.read_text()

start = text.find('STAGE=readiness-barrier')
end = text.find('STAGE=convergence')
if start < 0 or end <= start:
    raise SystemExit('readiness/convergence stage boundaries not found')
block = text[start:end]
if 'D200_READINESS_EVIDENCE_V2=1' not in block:
    raise SystemExit('readiness transport repair requires readiness evidence v2 first')
if 'D200_READINESS_TRANSPORT_GZIP_V1=1' in block:
    raise SystemExit('readiness transport repair already appears applied')

encode_old = r'''readiness_node_observations_b64=\$(jq -s -c 'sort_by(.nodeIndex)' "\$readiness_observations_dir"/*.json | base64 -w0)
echo READINESS_NODE_OBSERVATIONS_B64=\$readiness_node_observations_b64
'''
encode_new = r'''readiness_node_observations_b64=\$(jq -s -c 'sort_by(.nodeIndex)' "\$readiness_observations_dir"/*.json | gzip -c -9 | base64 -w0)
[[ "\${#readiness_node_observations_b64}" -le 3000 ]]
echo READINESS_NODE_OBSERVATIONS_B64=\$readiness_node_observations_b64
'''
if block.count(encode_old) != 1:
    raise SystemExit(f'unexpected readiness observation encoder count: {block.count(encode_old)}')
block = block.replace(encode_old, encode_new, 1)

decode_old = '''printf '%s' "$node_observations_b64" | base64 -d | jq -e 'type=="array" and length=='"$NODES_PER_HOST" >"$node_observations_file"'''
decode_new = '''printf '%s' "$node_observations_b64" | base64 -d | gzip -dc | jq -e 'type=="array" and length=='"$NODES_PER_HOST" >"$node_observations_file"'''
if block.count(decode_old) != 1:
    raise SystemExit(f'unexpected readiness observation decoder count: {block.count(decode_old)}')
block = block.replace(decode_old, decode_new, 1)

block = block.replace('D200_READINESS_EVIDENCE_V2=1\n', 'D200_READINESS_EVIDENCE_V2=1\nD200_READINESS_TRANSPORT_GZIP_V1=1\n', 1)

if block.count('deadline=\\$((\\$(date +%s) + 120))') != 1:
    raise SystemExit('readiness transport repair must preserve exactly one 120-second window')
if '"\\$hosts" -eq ${HOST_COUNT}' not in block:
    raise SystemExit('readiness transport repair must preserve full host diversity')
if '"\\$valid" -ge ${BOOTSTRAP_MAX_PEERS_PER_NODE}' not in block:
    raise SystemExit('readiness transport repair must preserve the maxPeers readiness bound')
if '/need' in block:
    raise SystemExit('readiness transport repair must remain read-only')
if 'gzip -c -9 | base64 -w0' not in block or 'base64 -d | gzip -dc | jq -e' not in block:
    raise SystemExit('readiness transport repair must use lossless gzip round-trip')
if '"\\${#readiness_node_observations_b64}" -le 3000' not in block:
    raise SystemExit('readiness transport repair must fail closed above the bounded RunCommand payload')

text = text[:start] + block + text[end:]
path.write_text(text)
