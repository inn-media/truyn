#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-post-restart-origin.py <campaign>')

path = Path(sys.argv[1])
text = path.read_text()
start_marker = 'STAGE=post-restart-routing\n'
end_marker = 'STAGE=packet-partition\n'
if text.count(start_marker) != 1:
    raise SystemExit(f'unexpected post-restart stage count: {text.count(start_marker)}')
if text.count(end_marker) != 1:
    raise SystemExit(f'unexpected packet-partition stage count: {text.count(end_marker)}')

start = text.index(start_marker)
end = text.index(end_marker)
block = text[start:end]
if 'D200_POST_RESTART_ORIGIN_DIAG=1' in block:
    raise SystemExit('post-restart origin diagnostic patch already appears applied')

required = {
    'post counters': 'post_success=0; post_total=0',
    'target host': 'target_host=$(((i+1)%HOST_COUNT))',
    'target node range': 'for j in range(10,15):',
    'single application timeout': "'--max-time','15'",
    'strict post-restart gate': "assert float('$post_rate') >= .99, '$post_rate'",
}
for label, snippet in required.items():
    if block.count(snippet) != 1:
        raise SystemExit(f'unexpected {label} count: {block.count(snippet)}')

replacement = r'''STAGE=post-restart-routing
D200_POST_RESTART_ORIGIN_DIAG=1
D200_POST_RESTART_ROW_MAX_BYTES=2400
post_success=0; post_total=0
post_diag_dir=$(mktemp -d)
post_target_dir=$(mktemp -d)
post_diag_json="${GITHUB_WORKSPACE:-$PWD}/class-d-200-post-restart-origin.json"
post_diag_jsonl="${GITHUB_WORKSPACE:-$PWD}/class-d-200-post-restart-origin.jsonl"
post_diag_digest="${GITHUB_WORKSPACE:-$PWD}/class-d-200-post-restart-origin-digest.txt"
: >"$post_diag_jsonl"

for i in $(seq 0 $((HOST_COUNT-1))); do
  target_host=$(((i+1)%HOST_COUNT))
  script=$(cat <<EOS
set -Eeuo pipefail
python3 - <<'PY'
import json,os,subprocess,time
from datetime import datetime

records=json.load(open('/var/lib/truyn-d1000/records-by-host.json'))
host=${i}; target_host=${target_host}; N=${NODES_PER_HOST}; base=${CONTROL_BASE}
diag_path=f'/var/lib/truyn-d1000/post-restart-origin-host-{host}.json'

def get_json(url, timeout='8'):
    p=subprocess.run(['curl','-sS','--max-time',timeout,url],text=True,capture_output=True)
    if p.returncode!=0:
        return {'ok':False,'curlRc':p.returncode,'stderr':p.stderr[-256:]}
    try:
        value=json.loads(p.stdout)
    except Exception:
        return {'ok':False,'curlRc':p.returncode,'parseError':True}
    return {'ok':True,'value':value}

def source_state():
    control=f'http://127.0.0.1:{base}'
    readiness=get_json(control+'/dht/readiness')
    status=get_json(control+'/status')
    r=(readiness.get('value') or {}).get('routing') or {}
    p=(readiness.get('value') or {}).get('peerRecordPropagation') or {}
    s=status.get('value') or {}
    return {
      'validPeers':r.get('validPeers'),
      'routingSize':r.get('routingSize'),
      'recordCount':r.get('recordCount'),
      'staleRoutingPeers':r.get('staleRoutingPeers'),
      'populatedBuckets':r.get('populatedBuckets'),
      'remoteHostCount':((readiness.get('value') or {}).get('remoteEndpointDiversity') or {}).get('hostCount'),
      'acceptanceReady':(readiness.get('value') or {}).get('acceptanceReady'),
      'peerRecordPropagationReady':p.get('ready'),
      'peerRecordPendingCount':p.get('pendingCount'),
      'dhtRpcTimeoutMs':s.get('dhtRpcTimeoutMs'),
      'readinessOk':bool(readiness.get('ok')),
      'statusOk':bool(status.get('ok')),
    }

def persisted_peer_state(node_id):
    state_path=f'/var/lib/truyn-d1000/node-{host*N}-state.json'
    result={'readOk':False,'present':False,'validNow':False}
    try:
        saved=json.load(open(state_path))
        result['readOk']=True
        record=next((item for item in (saved.get('peerRecords') or []) if item.get('nodeId')==node_id),None)
        if record is None:
            return result
        expires_at=record.get('expiresAt')
        expires_ms=None
        if isinstance(expires_at,str) and expires_at:
            try:
                expires_ms=int(datetime.fromisoformat(expires_at.replace('Z','+00:00')).timestamp()*1000)
            except Exception:
                expires_ms=None
        now_ms=int(time.time()*1000)
        expired=None if expires_ms is None else now_ms>=expires_ms
        result.update({
          'present':True,
          'sequence':record.get('sequence'),
          'recordId':record.get('recordId'),
          'expiresInMs':None if expires_ms is None else expires_ms-now_ms,
          'validNow':bool(expired is False),
        })
        return result
    except Exception as error:
        result['error']=type(error).__name__
        return result

def bounded_body(path):
    try:
        value=open(path,'r',encoding='utf-8',errors='replace').read(768)
        return value
    except Exception:
        return ''

def first_attempt(j):
    node_id=records[target_host][j]['nodeId']
    source_before=source_state()
    peer_before=persisted_peer_state(node_id)
    body=json.dumps({'nodeId':node_id,'input':{'scenario':'d1000-post-restart','targetLocalNode':j}},separators=(',',':'))
    out_path=f'/tmp/d1000-post-{j}'
    t=time.perf_counter_ns()
    p=subprocess.run(['curl','-sS','--max-time','15','-o',out_path,'-w','%{http_code}','-H','content-type: application/json','--data-binary',body,f'http://127.0.0.1:{base}/need'],text=True,capture_output=True)
    ms=(time.perf_counter_ns()-t)/1e6
    code=p.stdout.strip()
    first={
      'ok':bool(p.returncode==0 and code=='200'),
      'curlRc':p.returncode,
      'httpCode':code,
      'latencyMs':round(ms,3),
      'body':bounded_body(out_path),
      'stderr':p.stderr[-512:],
    }
    return {
      'sourceHost':host,
      'sourceLocalNode':0,
      'targetHost':target_host,
      'targetLocalNode':j,
      'targetNodeId':node_id,
      'firstAttempt':first,
      'sourceBefore':source_before,
      'peerRecordBefore':peer_before,
      'sourceAfter':source_state(),
      'peerRecordAfter':persisted_peer_state(node_id),
    }

rows=[first_attempt(j) for j in range(10,15)]
success=sum(1 for row in rows if row['firstAttempt']['ok'])
failures=[row for row in rows if not row['firstAttempt']['ok']]
summary={
  'schema':'truyn.d200.post-restart-origin.host.pending.v1',
  'host':host,
  'targetHost':target_host,
  'firstAttempt':{'success':success,'total':len(rows)},
  'failureCount':len(failures),
  'failures':failures,
  'acceptanceUsesFirstAttemptOnly':True,
  'applicationRetryCount':0,
}
os.makedirs(os.path.dirname(diag_path),exist_ok=True)
with open(diag_path,'w',encoding='utf-8') as handle:
    json.dump(summary,handle,separators=(',',':')); handle.write('\n')
print('POST_OK='+str(success))
print('POST_TOTAL='+str(len(rows)))
print('POST_FAILURE_COUNT='+str(len(failures)))
PY
EOS
)
  out=$(remote "${VMS[$i]}" "$script")
  ok=$(marker "$out" POST_OK); total=$(marker "$out" POST_TOTAL); failure_count=$(marker "$out" POST_FAILURE_COUNT)
  [[ "$total" == 5 ]]
  post_success=$((post_success+ok)); post_total=$((post_total+total))

  source_out=$(remote "${VMS[$i]}" "set -Eeuo pipefail; printf 'POST_SOURCE_DIAG_JSON='; cat /var/lib/truyn-d1000/post-restart-origin-host-${i}.json")
  source_json=$(marker "$source_out" POST_SOURCE_DIAG_JSON)
  [[ -n "$source_json" ]]
  printf '%s\n' "$source_json" >"$post_diag_dir/$i.json"
  target_locals=$(printf '%s' "$source_json" | jq -c '[.failures[]?.targetLocalNode]')
  [[ -n "$target_locals" ]]

  target_script=$(cat <<EOS
set -Eeuo pipefail
python3 - <<'PY'
import json,subprocess
records=json.load(open('/var/lib/truyn-d1000/records-by-host.json'))
target_host=${target_host}; base=${CONTROL_BASE}; target_locals=${target_locals}
result={}
for j in target_locals:
    node_id=records[target_host][j]['nodeId']
    p=subprocess.run(['curl','-sS','--max-time','4',f'http://127.0.0.1:{base+j}/dht/readiness'],text=True,capture_output=True)
    row={'observed':False,'curlRc':p.returncode}
    if p.returncode==0:
        try:
            value=json.loads(p.stdout); propagation=value.get('peerRecordPropagation') or {}; routing=value.get('routing') or {}
            row.update({
              'observed':True,
              'acceptanceReady':value.get('acceptanceReady'),
              'peerRecordPropagationReady':propagation.get('ready'),
              'acknowledgedCount':propagation.get('acknowledgedCount'),
              'pendingCount':propagation.get('pendingCount'),
              'validPeers':routing.get('validPeers'),
              'routingSize':routing.get('routingSize'),
              'staleRoutingPeers':routing.get('staleRoutingPeers'),
              'populatedBuckets':routing.get('populatedBuckets'),
              'remoteHostCount':(value.get('remoteEndpointDiversity') or {}).get('hostCount'),
            })
        except Exception:
            row['parseError']=True
    result[node_id]=row
print('POST_TARGET_READINESS_JSON='+json.dumps(result,separators=(',',':')))
PY
EOS
)
  target_out=$(remote "${VMS[$target_host]}" "$target_script")
  target_json=$(marker "$target_out" POST_TARGET_READINESS_JSON)
  [[ -n "$target_json" ]]
  printf '%s\n' "$target_json" >"$post_target_dir/$i.json"
  echo "TRUYN_CLASS_D_1000 stage=post-restart-routing host=$i targetHost=$target_host firstAttempt=${ok}/${total} failures=${failure_count} applicationRetries=0"
done

python3 - "$post_diag_dir" "$post_target_dir" "$post_diag_json" "$post_diag_jsonl" <<'PY'
import collections,json,pathlib,sys
source_dir=pathlib.Path(sys.argv[1]); target_dir=pathlib.Path(sys.argv[2]); out=pathlib.Path(sys.argv[3]); jsonl=pathlib.Path(sys.argv[4])
hosts=[]
classifications=collections.Counter()
for source_path in sorted(source_dir.glob('*.json'),key=lambda p:int(p.stem)):
    host=json.load(open(source_path,encoding='utf-8'))
    target=json.load(open(target_dir/source_path.name,encoding='utf-8'))
    failures=[]
    for row in host.get('failures') or []:
        readiness=target.get(row['targetNodeId']) or {'observed':False}
        row['targetReadinessObservedAfterFirstAttempt']=readiness
        peer=row.get('peerRecordBefore') or {}
        if readiness.get('observed') and (
            readiness.get('acceptanceReady') is not True or
            readiness.get('peerRecordPropagationReady') is not True or
            (readiness.get('pendingCount') not in (None,0))
        ):
            classification='target-propagation-not-ready'
        elif peer.get('present') is not True:
            classification='source-missing-target-record'
        elif peer.get('validNow') is not True:
            classification='source-has-stale-target-record'
        else:
            classification='valid-record-present-but-direct-route-failed'
        row['classification']=classification
        classifications[classification]+=1
        failures.append(row)
        with jsonl.open('a',encoding='utf-8') as handle:
            handle.write(json.dumps(row,separators=(',',':'))+'\n')
    host['schema']='truyn.d200.post-restart-origin.host.v1'
    host['failures']=failures
    host['failureCount']=len(failures)
    host['applicationRetryCount']=0
    hosts.append(host)

value={
  'schema':'truyn.d200.post-restart-origin.v1',
  'acceptanceUsesFirstAttemptOnly':True,
  'applicationRetryCount':0,
  'hosts':hosts,
  'classificationCounts':dict(sorted(classifications.items())),
  'firstAttempt':{
    'success':sum((h.get('firstAttempt') or {}).get('success',0) for h in hosts),
    'total':sum((h.get('firstAttempt') or {}).get('total',0) for h in hosts),
  },
}
out.write_text(json.dumps(value,separators=(',',':'))+'\n',encoding='utf-8')
PY
sha256sum "$post_diag_json" | awk '{print "sha256:"$1}' >"$post_diag_digest"
rm -rf "$post_diag_dir" "$post_target_dir"

post_rate=$(python3 -c "print(round($post_success/$post_total,6))")
python3 - <<PY
assert float('$post_rate') >= .99, '$post_rate'
PY
echo "TRUYN_CLASS_D_1000 stage=post-restart-routing success=${post_success}/${post_total} routingSuccess=${post_rate} firstAttemptOnly=true applicationRetries=0"

'''
text = text[:start] + replacement + text[end:]
path.write_text(text)
