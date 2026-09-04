#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-healed-evidence-transport.py <campaign>')

path = Path(sys.argv[1])
text = path.read_text()
start_marker = 'STAGE=healed-routing\n'
end_marker = 'STAGE=write-retention\n'
if text.count(start_marker) != 1:
    raise SystemExit(f'unexpected healed-routing stage count: {text.count(start_marker)}')
if text.count(end_marker) != 1:
    raise SystemExit(f'unexpected write-retention stage count: {text.count(end_marker)}')
start = text.index(start_marker)
end = text.index(end_marker)
block = text[start:end]

if 'D200_HEALED_EVIDENCE_TRANSPORT=1' in block:
    raise SystemExit('healed evidence transport patch already appears applied')

required = {
    'origin-aware classifier': ('D200_HEALED_ORIGIN_DIAG=1', 1),
    'full refresh result retention': ("'result':value", 1),
    'single oversized base64 marker': ('HEALED_DIAG_B64=', 1),
    'controller base64 marker read': ('diag_b64=$(marker "$out" HEALED_DIAG_B64)', 1),
    'origin-aware schema v2': ("'schema':'truyn.d200.healed-reconvergence.v2'", 1),
    'strict healed gate': ("assert float('$healed_rate') >= .99, '$healed_rate'", 1),
}
for label, (snippet, expected) in required.items():
    actual = block.count(snippet)
    if actual != expected:
        raise SystemExit(f'unexpected {label} count: {actual} (expected {expected})')

import_anchor = 'import base64, concurrent.futures, json, random, subprocess, time\n'
if block.count(import_anchor) != 1:
    raise SystemExit(f'unexpected healed diagnostic import count: {block.count(import_anchor)}')
block = block.replace(import_anchor, 'import base64, concurrent.futures, hashlib, json, random, subprocess, time\n')

refresh_old = "    return {'ok':bool(p.returncode==0),'curlRc':p.returncode,'latencyMs':round(ms,3),'result':value,'stderr':p.stderr[-512:]}\n"
refresh_new = r'''    result_summary=None
    if isinstance(value,dict):
        walks=value.get('walks') if isinstance(value.get('walks'),list) else []
        queried=value.get('queriedPeers') if isinstance(value.get('queriedPeers'),list) else []
        result_summary={
          'refreshed':bool(value.get('refreshed')),
          'reason':value.get('reason'),
          'targetCount':len(value.get('targets') or []) if isinstance(value.get('targets'),list) else 0,
          'walkCount':len(walks),
          'queriedPeerCount':len(queried),
          'responseCount':int(value.get('responses') or 0),
          'routingSizeDelta':value.get('routingSizeDelta'),
          'validPeersDelta':value.get('validPeersDelta'),
          'walksOmitted':len(walks),
        }
    return {'ok':bool(p.returncode==0),'curlRc':p.returncode,'latencyMs':round(ms,3),'resultSummary':result_summary,'stderr':p.stderr[-256:]}
'''
if block.count(refresh_old) != 1:
    raise SystemExit(f'unexpected full targeted refresh result count: {block.count(refresh_old)}')
block = block.replace(refresh_old, refresh_new)

summary_old = r'''counts={}
for item in failures: counts[item['classification']]=counts.get(item['classification'],0)+1
summary={'host':host,'firstAttempt':{'success':success,'total':total,'p50Ms':q(.50),'p90Ms':q(.90),'p95Ms':q(.95),'p99Ms':q(.99)},'failureCount':len(failures),'classificationCounts':counts,'failures':failures}
encoded=base64.b64encode(json.dumps(summary,separators=(',',':')).encode()).decode()
print('HEALED_OK='+str(success)); print('HEALED_TOTAL='+str(total)); print('HEALED_P50='+str(q(.50))); print('HEALED_P90='+str(q(.90))); print('HEALED_P95='+str(q(.95))); print('HEALED_P99='+str(q(.99))); print('HEALED_DIAG_B64='+encoded)
'''
summary_new = r'''counts={}
for item in failures: counts[item['classification']]=counts.get(item['classification'],0)+1
D200_HEALED_EVIDENCE_TRANSPORT=1
D200_HEALED_TRANSPORT_MAX_BYTES=1800
D200_HEALED_TRANSPORT_CHUNK_CHARS=512
D200_HEALED_FAILURE_SAMPLE_LIMIT=1

def compact_state(value):
    if not isinstance(value,dict): return None
    keys=('validPeers','routingSize','staleRoutingPeers','populatedBuckets')
    return {key:value.get(key) for key in keys}

def compact_peer(value):
    if not isinstance(value,dict): return None
    keys=('readOk','present','validNow','expired','expiresInMs')
    return {key:value.get(key) for key in keys}

def compact_probe(value):
    if not isinstance(value,dict): return None
    return {'ok':bool(value.get('ok')),'curlRc':value.get('curlRc'),'httpCode':value.get('httpCode'),'latencyMs':value.get('latencyMs')}

def compact_reset(value):
    if not isinstance(value,dict): return None
    def ok(key):
        item=value.get(key)
        return bool(item.get('ok')) if isinstance(item,dict) else None
    return {'ok':bool(value.get('ok')),'drainMs':value.get('drainMs'),'partitionOk':ok('partition'),'rediscardBeforeHealOk':ok('rediscardBeforeHeal'),'healOk':ok('heal')}

def compact_refresh(value):
    if not isinstance(value,dict): return None
    source=value.get('resultSummary') if isinstance(value.get('resultSummary'),dict) else {}
    return {
      'ok':bool(value.get('ok')),
      'latencyMs':value.get('latencyMs'),
      'resultSummary':{
        'refreshed':source.get('refreshed'),
        'queriedPeerCount':source.get('queriedPeerCount'),
        'responseCount':source.get('responseCount'),
        'routingSizeDelta':source.get('routingSizeDelta'),
        'validPeersDelta':source.get('validPeersDelta'),
      },
    }

def compact_failure(item):
    return {
      'sourceLocalNode':item.get('sourceLocalNode'),
      'targetHost':item.get('targetHost'),
      'targetLocalNode':item.get('targetLocalNode'),
      'classification':item.get('classification'),
      'recordTransition':item.get('recordTransition'),
      'firstAttempt':compact_probe(item.get('firstAttempt')),
      'stateBeforeRecovery':compact_state(item.get('stateBeforeRecovery')),
      'peerRecordBeforeFirstAttempt':compact_peer(item.get('peerRecordBeforeFirstAttempt')),
      'peerRecordAfterFirstAttempt':compact_peer(item.get('peerRecordAfterFirstAttempt')),
      'forcedTargetTransportReset':compact_reset(item.get('forcedTargetTransportReset')),
      'sessionResetRetry':compact_probe(item.get('sessionResetRetry')),
      'targetedRefresh':compact_refresh(item.get('targetedRefresh')),
      'peerRecordAfterTargetedRefresh':compact_peer(item.get('peerRecordAfterTargetedRefresh')),
      'postRefreshRetry':compact_probe(item.get('postRefreshRetry')),
    }

transport_failures=[compact_failure(item) for item in failures[:D200_HEALED_FAILURE_SAMPLE_LIMIT]]
summary={
  'host':host,
  'firstAttempt':{'success':success,'total':total,'p50Ms':q(.50),'p90Ms':q(.90),'p95Ms':q(.95),'p99Ms':q(.99)},
  'failureCount':len(failures),
  'classificationCounts':counts,
  'failureSampleCount':len(transport_failures),
  'failureSamplesOmitted':max(0,len(failures)-len(transport_failures)),
  'failures':transport_failures,
}
raw=json.dumps(summary,separators=(',',':')).encode()
payload_truncated=len(raw)>D200_HEALED_TRANSPORT_MAX_BYTES
print('HEALED_OK='+str(success)); print('HEALED_TOTAL='+str(total)); print('HEALED_P50='+str(q(.50))); print('HEALED_P90='+str(q(.90))); print('HEALED_P95='+str(q(.95))); print('HEALED_P99='+str(q(.99)))
if payload_truncated:
    print(f'HEALED_DIAG_META={len(raw)}:none:0:1')
else:
    digest=hashlib.sha256(raw).hexdigest()
    encoded=base64.b64encode(raw).decode()
    chunks=[encoded[offset:offset+D200_HEALED_TRANSPORT_CHUNK_CHARS] for offset in range(0,len(encoded),D200_HEALED_TRANSPORT_CHUNK_CHARS)]
    for index,chunk in enumerate(chunks): print(f'HEALED_DIAG_CHUNK_{index:02d}={chunk}')
    print(f'HEALED_DIAG_META={len(raw)}:{digest}:{len(chunks)}:0')
'''
if block.count(summary_old) != 1:
    raise SystemExit(f'unexpected healed host summary transport block count: {block.count(summary_old)}')
block = block.replace(summary_old, summary_new)

collector_old = r'''  diag_b64=$(marker "$out" HEALED_DIAG_B64)
  python3 - "$i" "$diag_b64" "$healed_diag_jsonl" <<'PYD200HOST'
import base64,json,sys
host=int(sys.argv[1]); raw=sys.argv[2]; path=sys.argv[3]
value=json.loads(base64.b64decode(raw).decode('utf-8'))
if value.get('host') != host: raise SystemExit('healed diagnostic host mismatch')
with open(path,'a',encoding='utf-8') as handle:
    handle.write(json.dumps(value,separators=(',',':'))+'\n')
PYD200HOST
'''.replace(r'\"', '"')
collector_new = r'''  diag_meta=$(marker "$out" HEALED_DIAG_META)
  if [[ -z "$diag_meta" ]]; then
    echo "TRUYN_D200_HEALED_PAYLOAD_TRUNCATED host=$i payload_truncated=1 reason=meta_missing" >&2
    exit 1
  fi
  IFS=':' read -r diag_bytes diag_sha diag_chunks diag_truncated <<<"$diag_meta"
  if [[ "$diag_truncated" != 0 ]]; then
    echo "TRUYN_D200_HEALED_PAYLOAD_TRUNCATED host=$i payload_truncated=1 reason=producer_byte_cap bytes=${diag_bytes:-unknown}" >&2
    exit 1
  fi
  if [[ ! "$diag_bytes" =~ ^[0-9]+$ || ! "$diag_sha" =~ ^[0-9a-f]{64}$ || ! "$diag_chunks" =~ ^[1-9][0-9]*$ ]]; then
    echo "TRUYN_D200_HEALED_PAYLOAD_TRUNCATED host=$i payload_truncated=1 reason=invalid_meta meta=${diag_meta}" >&2
    exit 1
  fi
  diag_b64=''
  for chunk_index in $(seq 0 $((diag_chunks-1))); do
    chunk_key=$(printf 'HEALED_DIAG_CHUNK_%02d' "$chunk_index")
    chunk_value=$(marker "$out" "$chunk_key")
    if [[ -z "$chunk_value" ]]; then
      echo "TRUYN_D200_HEALED_PAYLOAD_TRUNCATED host=$i payload_truncated=1 reason=missing_chunk chunk=${chunk_index} expected=${diag_chunks}" >&2
      exit 1
    fi
    diag_b64+="$chunk_value"
  done
  python3 - "$i" "$diag_b64" "$healed_diag_jsonl" "$diag_bytes" "$diag_sha" "$diag_chunks" <<'PYD200HOST'
import base64,hashlib,json,sys
host=int(sys.argv[1]); encoded=sys.argv[2]; path=sys.argv[3]; expected_bytes=int(sys.argv[4]); expected_sha=sys.argv[5]; chunks=int(sys.argv[6])
def fail(reason):
    raise SystemExit(f'TRUYN_D200_HEALED_PAYLOAD_TRUNCATED host={host} payload_truncated=1 reason={reason}')
try:
    raw=base64.b64decode(encoded,validate=True)
except Exception:
    fail('base64_invalid')
if len(raw) != expected_bytes: fail('byte_count_mismatch')
actual_sha=hashlib.sha256(raw).hexdigest()
if actual_sha != expected_sha: fail('sha256_mismatch')
try:
    value=json.loads(raw.decode('utf-8'))
except Exception:
    fail('json_invalid')
if value.get('host') != host: fail('host_mismatch')
value['evidenceTransport']={'schema':'truyn.d200.healed-evidence-transport.v1','payloadTruncated':False,'bytes':expected_bytes,'chunks':chunks,'sha256':'sha256:'+actual_sha}
with open(path,'a',encoding='utf-8') as handle:
    handle.write(json.dumps(value,separators=(',',':'))+'\n')
PYD200HOST
'''.replace(r'\"', '"')
if block.count(collector_old) != 1:
    raise SystemExit(f'unexpected healed diagnostic controller collector count: {block.count(collector_old)}')
block = block.replace(collector_old, collector_new)

if block.count("'schema':'truyn.d200.healed-reconvergence.v2'") != 1:
    raise SystemExit('unexpected v2 schema count before transport schema upgrade')
block = block.replace("'schema':'truyn.d200.healed-reconvergence.v2'", "'schema':'truyn.d200.healed-reconvergence.v3'")
aggregate_failure_old = "'classificationCounts':counts,'failureCount':len(failures),'hosts':rows,'failures':failures,"
aggregate_failure_new = "'classificationCounts':counts,'failureCount':sum(int(row.get('failureCount') or 0) for row in rows),'hosts':rows,'failures':failures,"
if block.count(aggregate_failure_old) != 1:
    raise SystemExit(f'unexpected aggregate failure count block count: {block.count(aggregate_failure_old)}')
block = block.replace(aggregate_failure_old, aggregate_failure_new)
summary_tail = "'diagnosticRetriesDoNotChangeHealedGate':True}"
summary_tail_new = "'diagnosticRetriesDoNotChangeHealedGate':True,'evidenceTransport':{'schema':'truyn.d200.healed-evidence-transport.v1','payloadTruncated':False,'hostPayloads':[row.get('evidenceTransport') for row in rows]}}"
if block.count(summary_tail) != 1:
    raise SystemExit(f'unexpected final diagnostic summary tail count: {block.count(summary_tail)}')
block = block.replace(summary_tail, summary_tail_new)

digest_anchor = 'rm -f "$healed_diag_jsonl"\n'
digest_new = r'''healed_diag_sha=$(sha256sum "$healed_diag_json" | awk '{print $1}')
printf 'sha256:%s\n' "$healed_diag_sha" > "${GITHUB_WORKSPACE:-$PWD}/class-d-200-healed-reconvergence-digest.txt"
rm -f "$healed_diag_jsonl"
'''.replace(r'\"', '"')
if block.count(digest_anchor) != 1:
    raise SystemExit(f'unexpected healed diagnostic jsonl cleanup count: {block.count(digest_anchor)}')
block = block.replace(digest_anchor, digest_new)

for forbidden in [
    "'result':value",
    'HEALED_DIAG_B64=',
    'diag_b64=$(marker "$out" HEALED_DIAG_B64)',
    "'schema':'truyn.d200.healed-reconvergence.v2'",
    "'classificationCounts':counts,'failureCount':len(failures),'hosts':rows",
]:
    if forbidden in block:
        raise SystemExit(f'unsafe healed diagnostic evidence transport remained after patch: {forbidden}')
for marker in [
    'D200_HEALED_EVIDENCE_TRANSPORT=1',
    'D200_HEALED_TRANSPORT_MAX_BYTES=1800',
    'D200_HEALED_TRANSPORT_CHUNK_CHARS=512',
    'D200_HEALED_FAILURE_SAMPLE_LIMIT=1',
    "'queriedPeerCount':len(queried)",
    "'resultSummary':result_summary",
    "'failureSamplesOmitted':max(0,len(failures)-len(transport_failures))",
    "sum(int(row.get('failureCount') or 0) for row in rows)",
    'HEALED_DIAG_CHUNK_',
    'HEALED_DIAG_META=',
    'payload_truncated=1 reason=missing_chunk',
    "fail('sha256_mismatch')",
    "'schema':'truyn.d200.healed-reconvergence.v3'",
    "'schema':'truyn.d200.healed-evidence-transport.v1'",
    'class-d-200-healed-reconvergence-digest.txt',
    "assert float('$healed_rate') >= .99, '$healed_rate'",
]:
    if marker not in block:
        raise SystemExit(f'bounded healed evidence transport marker missing after patch: {marker}')

text = text[:start] + block + text[end:]
path.write_text(text)