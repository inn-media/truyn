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
decode_new = '''printf '%s' "$node_observations_b64" | base64 -d | gzip -dc | jq -e 'if type=="array" and length=='"$NODES_PER_HOST"' then . else error("invalid readiness observation payload") end' >"$node_observations_file"'''
if block.count(decode_old) != 1:
    raise SystemExit(f'unexpected readiness observation decoder count: {block.count(decode_old)}')
block = block.replace(decode_old, decode_new, 1)

recovery_anchor = r'''    hosts=\$(printf '%s' "\$readiness" | jq -r '.remoteEndpointDiversity.hostCount')
'''
recovery_block = recovery_anchor + r'''    if [[ "\$hosts" -lt ${HOST_COUNT} ]]; then
      readiness_present_hosts_json=\$(printf '%s' "\$readiness" | jq -c '.remoteEndpointDiversity.hosts // []')
      readiness_recovery_targets=\$(jq -nc \
        --argjson expected "\$readiness_expected_hosts_json" \
        --argjson present "\$readiness_present_hosts_json" \
        --slurpfile records /var/lib/truyn-d1000/records-by-host.json '
          [ \$expected | to_entries[] | . as \$entry
            | select((\$present | index(\$entry.value)) == null)
            | \$records[0][\$entry.key][0].nodeId
          ] | unique
        ')
      readiness_recovery_target_count=\$(printf '%s' "\$readiness_recovery_targets" | jq 'length')
      if [[ "\$readiness_recovery_target_count" -gt 0 ]]; then
        [[ "\$readiness_recovery_target_count" -le ${HOST_COUNT} ]]
        [[ "\$readiness_recovery_target_count" -le ${BOOTSTRAP_MAX_PEERS_PER_NODE} ]]
        readiness_refresh_body=\$(jq -nc \
          --argjson targets "\$readiness_recovery_targets" \
          --arg seed "d200-readiness-\${j}-\${readiness_now}" \
          '{targets:\$targets,targetCount:(\$targets|length),maxRounds:4,seed:\$seed}')
        readiness_refresh_timeout=\$readiness_remaining
        if [[ "\$readiness_refresh_timeout" -gt 10 ]]; then readiness_refresh_timeout=10; fi
        curl -fsS --max-time "\$readiness_refresh_timeout" \
          -H 'content-type: application/json' \
          --data-binary "\$readiness_refresh_body" \
          "\${control_url}/dht/refresh" \
          >"/tmp/truyn-d200-readiness-refresh-\${j}.json" 2>/dev/null || true
      fi
    fi
'''
if block.count(recovery_anchor) != 1:
    raise SystemExit(f'unexpected readiness host-count anchor count: {block.count(recovery_anchor)}')
block = block.replace(recovery_anchor, recovery_block, 1)

block = block.replace('D200_READINESS_EVIDENCE_V2=1\n', 'D200_READINESS_EVIDENCE_V2=1\nD200_READINESS_TRANSPORT_GZIP_V1=1\nD200_READINESS_LEASE_RECOVERY_V1=1\n', 1)

if block.count('deadline=\\$((\\$(date +%s) + 120))') != 1:
    raise SystemExit('readiness transport repair must preserve exactly one 120-second window')
if '"\\$hosts" -eq ${HOST_COUNT}' not in block:
    raise SystemExit('readiness transport repair must preserve full host diversity')
if '"\\$valid" -ge ${BOOTSTRAP_MAX_PEERS_PER_NODE}' not in block:
    raise SystemExit('readiness transport repair must preserve the maxPeers readiness bound')
if '/need' in block:
    raise SystemExit('readiness transport repair must never retry application NEED')
if 'gzip -c -9 | base64 -w0' not in block or 'base64 -d | gzip -dc | jq -e' not in block:
    raise SystemExit('readiness transport repair must use lossless gzip round-trip')
if '"\\${#readiness_node_observations_b64}" -le 3000' not in block:
    raise SystemExit('readiness transport repair must fail closed above the bounded RunCommand payload')
if '/var/lib/truyqn-d1000/' in block or '/var/lib/truqyn-d1000/' in block:
    raise SystemExit('readiness lease recovery must use canonical truyn runtime paths')
if '/var/lib/truyn-d1000/records-by-host.json' not in block:
    raise SystemExit('readiness lease recovery must use canonical records-by-host evidence')
if '"\\${control_url}/dht/refresh"' not in block:
    raise SystemExit('readiness lease recovery must use control-plane DHT refresh')
if '"\\$readiness_recovery_target_count" -le ${HOST_COUNT}' not in block:
    raise SystemExit('readiness lease recovery must remain bounded by physical host count')
if '"\\$readiness_recovery_target_count" -le ${BOOTSTRAP_MAX_PEERS_PER_NODE}' not in block:
    raise SystemExit('readiness lease recovery must remain below the existing maxPeers bound')
if 'targetCount:(\\$targets|length),maxRounds:4' not in block:
    raise SystemExit('readiness lease recovery must explicitly bound each directed refresh')
if 'if type=="array" and length==' not in block or 'then . else error("invalid readiness observation payload") end' not in block:
    raise SystemExit('readiness observation decoder must validate without replacing evidence with boolean true')

text = text[:start] + block + text[end:]
path.write_text(text)