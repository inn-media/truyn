#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-baseline-origin.py <campaign>')

path = Path(sys.argv[1])
text = path.read_text()
start_marker = 'STAGE=baseline-routing\n'
end_marker = 'STAGE=invalid-signed-state\n'
if text.count(start_marker) != 1:
    raise SystemExit(f'unexpected baseline-routing stage count: {text.count(start_marker)}')
if text.count(end_marker) != 1:
    raise SystemExit(f'unexpected invalid-signed-state stage count: {text.count(end_marker)}')
start = text.index(start_marker)
end = text.index(end_marker)
block = text[start:end]

if 'D200_BASELINE_ORIGIN_DIAG=1' in block:
    raise SystemExit('baseline origin diagnostic patch already appears applied')

required = {
    'baseline seed': ('random.Random(20260818+host*10000+k)', 1),
    'target host selection': ('target_host=r.randrange(H-1)', 1),
    'target local selection': ('target_local=r.randrange(N)', 1),
    'baseline scenario': ("'scenario':'d1000-baseline'", 1),
    'single first-attempt timeout': ("'--max-time','15'", 1),
    'strict baseline gate': ("assert float('$base_rate') >= .99, '$base_rate'", 1),
}
for label, (snippet, expected) in required.items():
    actual = block.count(snippet)
    if actual != expected:
        raise SystemExit(f'unexpected {label} count: {actual} (expected {expected})')

new = r'''STAGE=baseline-routing
D200_BASELINE_ORIGIN_DIAG=1
D200_BASELINE_ROW_MAX_BYTES=1800
base_success=0; base_total=0; base_p50=0; base_p90=0; base_p95=0; base_p99=0
baseline_dir=$(mktemp -d)
baseline_diag_phase_dir=$(mktemp -d)
baseline_diag_jsonl="${GITHUB_WORKSPACE:-$PWD}/class-d-200-baseline-origin.jsonl"
baseline_diag_json="${GITHUB_WORKSPACE:-$PWD}/class-d-200-baseline-origin.json"
baseline_diag_digest="${GITHUB_WORKSPACE:-$PWD}/class-d-200-baseline-origin-digest.txt"
: >"$baseline_diag_jsonl"
baseline_pids=()
declare -a baseline_failure_counts

# Phase 1: all hosts finish canonical first-attempt probes before any
# diagnostic retry is allowed to start anywhere in the 20-host campaign.
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
python3 - <<'PY'
import concurrent.futures,json,os,random,subprocess,time
records=json.load(open('/var/lib/truyqn-d1000/records-by-host.json'))
host=${i}; H=${HOST_COUNT}; N=${NODES_PER_HOST}; base=${CONTROL_BASE}
diag_path=f'/var/lib/truyqn-d1000/baseline-origin-host-{host}.json'

def get_json(url, timeout='8'):
    p=subprocess.run(['curl','-sS','--max-time',timeout,url],text=True,capture_output=True)
    if p.returncode!=0:
        return {'ok':False,'curlRc':p.returncode}
    try:
        value=json.loads(p.stdout)
    except Exception:
        return {'ok':False,'curlRc':p.returncode,'parseError':True}
    return {'ok':True,'value':value}

def state(j):
    control=f'http://127.0.0.1:{base+j}'
    readiness=get_json(control+'/dht/readiness')
    status=get_json(control+'/status')
    r=(readiness.get('value') or {}).get('routing') or {}
    s=status.get('value') or {}
    return {
      'validPeers':r.get('validPeers'),
      'routingSize':r.get('routingSize'),
      'recordCount':r.get('recordCount'),
      'staleRoutingPeers':r.get('staleRoutingPeers'),
      'populatedBuckets':r.get('populatedBuckets'),
      'dhtRpcTimeoutMs':s.get('dhtRpcTimeoutMs'),
      'readinessOk':bool(readiness.get('ok')),
      'statusOk':bool(status.get('ok')),
    }

def persisted_peer_state(j,node_id):
    global_index=host*N+j
    path=f'/var/lib/truyqn-d1000/node-{global_index}-state.json'
    result={'readOk':False,'present':False,'validNow':False}
    try:
        value=json.load(open(path))
        result['readOk']=True
        record=next((item for item in (value.get('peerRecords') or []) if item.get('nodeId')==node_id),None)
        if record is None:
            return result
        expires_at=record.get('expiresAt')
        expires_ms=None
        if isinstance(expires_at,str) and expires_at:
            try:
                from datetime import datetime
                expires_ms=int(datetime.fromisoformat(expires_at.replace('Z','+00:00')).timestamp()*1000)
            except Exception:
                expires_ms=None
        now_ms=int(time.time()*1000)
        expired=None if expires_ms is None else now_ms>=expires_ms
        result.update({
          'present':True,
          'sequence':record.get('sequence'),
          'expiresInMs':None if expires_ms is None else expires_ms-now_ms,
          'validNow':bool(expired is False),
        })
        return result
    except Exception:
        return result

def need(j,node_id,k):
    body=json.dumps({'nodeId':node_id,'input':{'scenario':'d1000-baseline','probe':k}},separators=(',',':'))
    t=time.perf_counter_ns()
    p=subprocess.run(['curl','-sS','--max-time','15','-o',f'/tmp/d1000-base-first-{k}','-w','%{http_code}','-H','content-type: application/json','--data-binary',body,f'http://127.0.0.1:{base+j}/need'],text=True,capture_output=True)
    ms=(time.perf_counter_ns()-t)/1e6
    code=p.stdout.strip()
    return {'ok':bool(p.returncode==0 and code=='200'),'curlRc':p.returncode,'httpCode':code,'latencyMs':round(ms,3)}

def first_attempt(k):
    j=k%N
    r=random.Random(20260818+host*10000+k)
    target_host=r.randrange(H-1)
    if target_host>=host: target_host+=1
    target_local=r.randrange(N)
    node_id=records[target_host][target_local]['nodeId']
    state_before=state(j)
    peer_before=persisted_peer_state(j,node_id)
    first=need(j,node_id,k)
    context={
      'sourceHost':host,'sourceLocalNode':j,'probe':k,
      'targetHost':target_host,'targetLocalNode':target_local,'targetNodeId':node_id,
      'firstAttempt':first,
      'peerRecordBeforeFirstAttempt':peer_before,
      'routingBeforeFirstAttempt':state_before,
    }
    return (int(first['ok']),first['latencyMs'],context)

with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
    rows=list(ex.map(first_attempt,range(N*2)))
lat=sorted(v for ok,v,_ in rows if ok); success=sum(ok for ok,_,_ in rows); total=N*2
failures=[ctx for ok,_,ctx in rows if not ok]
def q(p):
    if not lat:return 999999
    return round(lat[min(len(lat)-1,max(0,int((len(lat)-1)*p)))],3)
summary={
  'schema':'truyn.d200.baseline-origin.host.pending.v1',
  'host':host,
  'firstAttempt':{'success':success,'total':total,'p50Ms':q(.50),'p90Ms':q(.90),'p95Ms':q(.95),'p99Ms':q(.99)},
  'failureCount':len(failures),
  'failures':failures,
  'acceptanceUsesFirstAttemptOnly':True,
  'diagnosticRetriesDoNotChangeBaselineGate':True,
}
os.makedirs(os.path.dirname(diag_path),exist_ok=True)
with open(diag_path,'w',encoding='utf-8') as handle:
    json.dump(summary,handle,separators=(',',':')); handle.write('\n')
print('BASE_OK='+str(success)); print('BASE_TOTAL='+str(total))
print('BASE_P50='+str(q(.50))); print('BASE_P90='+str(q(.90))); print('BASE_P95='+str(q(.95))); print('BASE_P99='+str(q(.99)))
print('BASE_FAILURE_COUNT='+str(len(failures)))
PY
EOS
)
  (remote "${VMS[$i]}" "$script" >"$baseline_dir/$i") &
  baseline_pids+=("$!")
done

baseline_failed=0
for pid in "${baseline_pids[@]}"; do
  if ! wait "$pid"; then baseline_failed=1; fi
done
if [[ "$baseline_failed" != 0 ]]; then
  rm -rf "$baseline_dir" "$baseline_diag_phase_dir"
  false
fi

for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$baseline_dir/$i")"
  ok=$(marker "$out" BASE_OK); total=$(marker "$out" BASE_TOTAL)
  p50=$(marker "$out" BASE_P50); p90=$(marker "$out" BASE_P90); p95=$(marker "$out" BASE_P95); p99=$(marker "$out" BASE_P99)
  failure_count=$(marker "$out" BASE_FAILURE_COUNT)
  baseline_failure_counts[$i]="$failure_count"
  base_success=$((base_success+ok)); base_total=$((base_total+total))
  base_p50=$(python3 -c "print(max(float('$base_p50'),float('$p50')))" ); base_p90=$(python3 -c "print(max(float('$base_p90'),float('$p90')))" )
  base_p95=$(python3 -c "print(max(float('$base_p95'),float('$p95')))" ); base_p99=$(python3 -c "print(max(float('$base_p99'),float('$p99')))" )
  echo "TRUYN_CLASS_D_1000 stage=baseline host=$i mode=parallel-hosts success=${ok}/${total} failures=${failure_count} p50Ms=${p50} p90Ms=${p90} p95Ms=${p95} p99Ms=${p99}"
done

# Phase 2: only after the global first-attempt barrier, run one separate
# production /need retry for each failure. These retries are evidence only.
baseline_diag_pids=()
for i in $(seq 0 $((HOST_COUNT-1))); do
  failure_count="${baseline_failure_counts[$i]}"
  if [[ "$failure_count" == 0 ]]; then continue; fi
  script=$(cat <<EOS
set -Eeuo pipefail
python3 - <<'PY'
import concurrent.futures,json,subprocess,time
host=${i}; N=${NODES_PER_HOST}; base=${CONTROL_BASE}
path=f'/var/lib/truyqn-d1000/baseline-origin-host-{host}.json'
value=json.load(open(path))

def get_json(url, timeout='8'):
    p=subprocess.run(['curl','-sS','--max-time',timeout,url],text=True,capture_output=True)
    if p.returncode!=0:
        return {'ok':False,'curlRc':p.returncode}
    try:
        body=json.loads(p.stdout)
    except Exception:
        return {'ok':False,'curlRc':p.returncode,'parseError':True}
    return {'ok':True,'value':body}

def state(j):
    control=f'http://127.0.0.1:{base+j}'
    readiness=get_json(control+'/dht/readiness')
    status=get_json(control+'/status')
    r=(readiness.get('value') or {}).get('routing') or {}
    s=status.get('value') or {}
    return {
      'validPeers':r.get('validPeers'),
      'routingSize':r.get('routingSize'),
      'recordCount':r.get('recordCount'),
      'staleRoutingPeers':r.get('staleRoutingPeers'),
      'populatedBuckets':r.get('populatedBuckets'),
      'dhtRpcTimeoutMs':s.get('dhtRpcTimeoutMs'),
      'readinessOk':bool(readiness.get('ok')),
      'statusOk':bool(status.get('ok')),
    }

def persisted_peer_state(j,node_id):
    global_index=host*N+j
    state_path=f'/var/lib/truyqn-d1000/node-{global_index}-state.json'
    result={'readOk':False,'present':False,'validNow':False}
    try:
        saved=json.load(open(state_path))
        result['readOk']=True
        record=next((item for item in (saved.get('peerRecords') or []) if item.get('nodeId')==node_id),None)
        if record is None:return result
        expires_at=record.get('expiresAt'); expires_ms=None
        if isinstance(expires_at,str) and expires_at:
            try:
                from datetime import datetime
                expires_ms=int(datetime.fromisoformat(expires_at.replace('Z','+00:00')).timestamp()*1000)
            except Exception: expires_ms=None
        now_ms=int(time.time()*1000); expired=None if expires_ms is None else now_ms>=expires_ms
        result.update({'present':True,'sequence':record.get('sequence'),'expiresInMs':None if expires_ms is None else expires_ms-now_ms,'validNow':bool(expired is False)})
        return result
    except Exception:return result

def retry(ctx):
    j=ctx['sourceLocalNode']; k=ctx['probe']; node_id=ctx['targetNodeId']
    state_after_first=state(j); peer_after_first=persisted_peer_state(j,node_id)
    body=json.dumps({'nodeId':node_id,'input':{'scenario':'d1000-baseline-production-recovery-retry','probe':k}},separators=(',',':'))
    t=time.perf_counter_ns()
    p=subprocess.run(['curl','-sS','--max-time','15','-o',f'/tmp/d1000-base-production-recovery-{k}','-w','%{http_code}','-H','content-type: application/json','--data-binary',body,f'http://127.0.0.1:{base+j}/need'],text=True,capture_output=True)
    ms=(time.perf_counter_ns()-t)/1e6; code=p.stdout.strip()
    retry_result={'ok':bool(p.returncode==0 and code=='200'),'curlRc':p.returncode,'httpCode':code,'latencyMs':round(ms,3)}
    state_after_retry=state(j); peer_after_retry=persisted_peer_state(j,node_id)
    peer_before=ctx['peerRecordBeforeFirstAttempt']
    if peer_before.get('validNow') is True:
        origin='valid-record-before-first-attempt'
    elif peer_after_first.get('validNow') is True:
        origin='record-became-valid-before-production-recovery-retry'
    elif peer_after_retry.get('validNow') is True:
        origin='record-became-valid-during-production-recovery-retry'
    elif not peer_before.get('readOk'):
        origin='peer-state-unavailable'
    elif peer_before.get('present'):
        origin='stale-record'
    else:
        origin='missing-record'
    ctx.update({
      'classification':origin+'-retry-recovered' if retry_result['ok'] else origin+'-persistent-after-production-recovery-retry',
      'peerRecordAfterFirstAttemptBarrier':peer_after_first,
      'routingAfterFirstAttemptBarrier':state_after_first,
      'boundedProductionDiscoveryRecovery':{
        'diagnosticRetry':retry_result,
        'peerRecordAfterRetry':peer_after_retry,
        'routingAfterRetry':state_after_retry,
        'targetRecordRecoveredBeforeDiagnosticRetry':bool(peer_before.get('validNow') is not True and peer_after_first.get('validNow') is True),
        'targetRecordRecoveredByRetryWindow':bool(peer_after_first.get('validNow') is not True and peer_after_retry.get('validNow') is True),
        'countedInBaselineAcceptance':False,
      },
    })
    return ctx

with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
    failures=list(ex.map(retry,value.get('failures') or []))
value['schema']='truyn.d200.baseline-origin.host.v1'
value['failures']=failures
value['failureCount']=len(failures)
with open(path,'w',encoding='utf-8') as handle:
    json.dump(value,handle,separators=(',',':')); handle.write('\n')
print('BASE_DIAG_READY=1')
print('BASE_DIAG_FAILURE_COUNT='+str(len(failures)))
PY
EOS
)
  (remote "${VMS[$i]}" "$script" >"$baseline_diag_phase_dir/$i") &
  baseline_diag_pids+=("$!")
done
baseline_diag_failed=0
for pid in "${baseline_diag_pids[@]}"; do
  if ! wait "$pid"; then baseline_diag_failed=1; fi
done
if [[ "$baseline_diag_failed" != 0 ]]; then
  rm -rf "$baseline_dir" "$baseline_diag_phase_dir"
  false
fi

# Each failed row is fetched in its own bounded remote call. This avoids a
# single oversized stdout/base64 payload while retaining every failure.
for i in $(seq 0 $((HOST_COUNT-1))); do
  failure_count="${baseline_failure_counts[$i]}"
  if [[ "$failure_count" == 0 ]]; then continue; fi
  diag_out="$(cat "$baseline_diag_phase_dir/$i")"
  [[ "$(marker "$diag_out" BASE_DIAG_READY)" == 1 ]]
  [[ "$(marker "$diag_out" BASE_DIAG_FAILURE_COUNT)" == "$failure_count" ]]
  for n in $(seq 0 $((failure_count-1))); do
    row_out=$(remote "${VMS[$i]}" "set -Eeuo pipefail; python3 - <<'PY'
import base64,hashlib,json
path='/var/lib/truyqn-d1000/baseline-origin-host-${i}.json'
n=${n}
value=json.load(open(path))
row=value['failures'][n]
raw=json.dumps(row,separators=(',',':')).encode()
if len(raw)>${D200_BASELINE_ROW_MAX_BYTES}:
    raise SystemExit('TRUYN_D200_BASELINE_ROW_TOO_LARGE bytes='+str(len(raw)))
print('BASE_DIAG_BYTES='+str(len(raw)))
print('BASE_DIAG_SHA256='+hashlib.sha256(raw).hexdigest())
print('BASE_DIAG_B64='+base64.b64encode(raw).decode())
PY")
    row_bytes=$(marker "$row_out" BASE_DIAG_BYTES)
    row_sha=$(marker "$row_out" BASE_DIAG_SHA256)
    row_b64=$(marker "$row_out" BASE_DIAG_B64)
    python3 - "$i" "$row_bytes" "$row_sha" "$row_b64" "$baseline_diag_jsonl" <<'PYD200BASE'
import base64,hashlib,json,sys
host=int(sys.argv[1]); expected_bytes=int(sys.argv[2]); expected_sha=sys.argv[3]; raw=base64.b64decode(sys.argv[4],validate=True)
if len(raw)!=expected_bytes: raise SystemExit('TRUYN_D200_BASELINE_PAYLOAD_TRUNCATED reason=byte_count')
if hashlib.sha256(raw).hexdigest()!=expected_sha: raise SystemExit('TRUYN_D200_BASELINE_PAYLOAD_TRUNCATED reason=sha256')
value=json.loads(raw.decode('utf-8'))
if value.get('sourceHost')!=host: raise SystemExit('TRUYN_D200_BASELINE_PAYLOAD_TRUNCATED reason=host_mismatch')
with open(sys.argv[5],'a',encoding='utf-8') as handle:
    handle.write(json.dumps(value,separators=(',',':'))+'\n')
PYD200BASE
  done
done
rm -rf "$baseline_dir" "$baseline_diag_phase_dir"

base_rate=$(python3 -c "print(round($base_success/$base_total,6))")
python3 - "$baseline_diag_jsonl" "$baseline_diag_json" "$baseline_diag_digest" "$base_success" "$base_total" "$base_rate" <<'PYD200BASESUMMARY'
import hashlib,json,sys
rows=[]
with open(sys.argv[1],encoding='utf-8') as handle:
    for line in handle:
        line=line.strip()
        if line: rows.append(json.loads(line))
expected=int(sys.argv[5])-int(sys.argv[4])
if len(rows)!=expected:
    raise SystemExit(f'TRUYN_D200_BASELINE_PAYLOAD_TRUNCATED reason=evidence_count expected={expected} actual={len(rows)}')
value={
  'schema':'truyn.d200.baseline-origin.v1',
  'firstAttempt':{'success':int(sys.argv[4]),'total':int(sys.argv[5]),'successRatio':float(sys.argv[6])},
  'failureCount':len(rows),
  'failures':rows,
  'acceptanceUsesFirstAttemptOnly':True,
  'diagnosticRetriesDoNotChangeBaselineGate':True,
}
raw=(json.dumps(value,separators=(',',':'))+'\n').encode()
open(sys.argv[2],'wb').write(raw)
open(sys.argv[3],'w',encoding='utf-8').write('sha256:'+hashlib.sha256(raw).hexdigest()+'\n')
PYD200BASESUMMARY
rm -f "$baseline_diag_jsonl"

python3 - <<PY
assert float('$base_rate') >= .99, '$base_rate'
PY
echo "TRUYN_CLASS_D_1000 stage=baseline success=${base_success}/${base_total} routingSuccess=${base_rate} p50Ms=${base_p50} p90Ms=${base_p90} p95Ms=${base_p95} p99Ms=${base_p99}"

'''

text = text[:start] + new + text[end:]
patched_block = text[start:text.index(end_marker, start)]
for marker in [
    'D200_BASELINE_ORIGIN_DIAG=1',
    'D200_BASELINE_ROW_MAX_BYTES=1800',
    "peer_before=persisted_peer_state(j,node_id)",
    "'routingBeforeFirstAttempt':state_before",
    "'d1000-baseline-production-recovery-retry'",
    "'countedInBaselineAcceptance':False",
    'class-d-200-baseline-origin.json',
    'class-d-200-baseline-origin-digest.txt',
    'TRUYN_D200_BASELINE_PAYLOAD_TRUNCATED',
    "assert float('$base_rate') >= .99, '$base_rate'",
]:
    if marker not in patched_block:
        raise SystemExit(f'baseline origin diagnostic marker missing after patch: {marker}')

path.write_text(text)
