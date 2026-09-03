#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-healed-reconvergence.py <campaign>')

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
if 'HEALED_DIAG_B64=' in block or 'class-d-200-healed-reconvergence.json' in block:
    raise SystemExit('healed reconvergence diagnostic patch already appears applied')

required = {
    'seed': ('random.Random(20260820+host*10000+k)', 1),
    'target host selection': ('target_host=r.randrange(H-1)', 1),
    'target local selection': ('target_local=r.randrange(N)', 1),
    'healed scenario': ("'scenario':'d1000-healed'", 1),
    'single probe timeout': ("'--max-time','15'", 1),
    'first-attempt success accounting': ('success=sum(ok for ok,_ in rows)', 1),
    'strict healed gate': ("assert float('$healed_rate') >= .99, '$healed_rate'", 1),
}
for label, (snippet, expected) in required.items():
    actual = block.count(snippet)
    if actual != expected:
        raise SystemExit(f'unexpected {label} count: {actual} (expected {expected})')

new = r'''STAGE=healed-routing
healed_success=0; healed_total=0; healed_p50=0; healed_p90=0; healed_p95=0; healed_p99=0
healed_diag_jsonl="${GITHUB_WORKSPACE:-$PWD}/class-d-200-healed-reconvergence.jsonl"
healed_diag_json="${GITHUB_WORKSPACE:-$PWD}/class-d-200-healed-reconvergence.json"
: >"$healed_diag_jsonl"
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
python3 - <<'PY'
import base64, concurrent.futures, json, random, subprocess, time
records=json.load(open('/var/lib/truyn-d1000/records-by-host.json'))
host=${i}; H=${HOST_COUNT}; N=${NODES_PER_HOST}; base=${CONTROL_BASE}

def bounded_body(path):
    try:
        data=open(path,'rb').read(1536)
        return data.decode('utf-8','replace')
    except Exception:
        return ''

def get_json(url, timeout='8'):
    p=subprocess.run(['curl','-sS','--max-time',timeout,url],text=True,capture_output=True)
    if p.returncode!=0:
        return {'ok':False,'curlRc':p.returncode,'stderr':p.stderr[-512:]}
    try:
        value=json.loads(p.stdout)
    except Exception:
        return {'ok':False,'curlRc':p.returncode,'parseError':True,'body':p.stdout[:512]}
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
      'peerRecordSequence':s.get('peerRecordSequence'),
      'dhtRpcTimeoutMs':s.get('dhtRpcTimeoutMs'),
      'readinessOk':bool(readiness.get('ok')),
      'statusOk':bool(status.get('ok')),
    }

def need(j,node_id,scenario,k,label):
    body=json.dumps({'nodeId':node_id,'input':{'scenario':scenario,'probe':k}},separators=(',',':'))
    out=f'/tmp/d1000-healed-{label}-{k}'
    t=time.perf_counter_ns()
    p=subprocess.run(['curl','-sS','--max-time','15','-o',out,'-w','%{http_code}','-H','content-type: application/json','--data-binary',body,f'http://127.0.0.1:{base+j}/need'],text=True,capture_output=True)
    ms=(time.perf_counter_ns()-t)/1e6
    code=p.stdout.strip()
    return {'ok':bool(p.returncode==0 and code=='200'),'curlRc':p.returncode,'httpCode':code,'latencyMs':round(ms,3),'body':bounded_body(out),'stderr':p.stderr[-512:]}

def targeted_refresh(j,node_id,k):
    control=f'http://127.0.0.1:{base+j}/dht/refresh'
    body=json.dumps({'targets':[node_id],'targetCount':1,'maxRounds':8,'seed':f'd200-heal:{host}:{j}:{k}'},separators=(',',':'))
    t=time.perf_counter_ns()
    p=subprocess.run(['curl','-sS','--max-time','45','-H','content-type: application/json','--data-binary',body,control],text=True,capture_output=True)
    ms=(time.perf_counter_ns()-t)/1e6
    value=None
    if p.returncode==0:
        try:value=json.loads(p.stdout)
        except Exception:value=None
    return {'ok':bool(p.returncode==0),'curlRc':p.returncode,'latencyMs':round(ms,3),'result':value,'stderr':p.stderr[-512:]}

def one(k):
    j=k%N
    r=random.Random(20260820+host*10000+k)
    target_host=r.randrange(H-1)
    if target_host>=host: target_host+=1
    target_local=r.randrange(N)
    node_id=records[target_host][target_local]['nodeId']
    first=need(j,node_id,'d1000-healed',k,'first')
    if first['ok']:
        return (1,first['latencyMs'],None)
    before=state(j)
    fresh=need(j,node_id,'d1000-healed-fresh-session-retry',k,'fresh')
    refresh=None
    after_refresh=None
    post_refresh=None
    if fresh['ok']:
        classification='fresh-session-recovered'
    else:
        refresh=targeted_refresh(j,node_id,k)
        after_refresh=state(j)
        post_refresh=need(j,node_id,'d1000-healed-target-refresh-retry',k,'refresh')
        classification='target-refresh-recovered' if post_refresh['ok'] else 'persistent-after-refresh'
    diag={
      'sourceHost':host,'sourceLocalNode':j,'targetHost':target_host,'targetLocalNode':target_local,'targetNodeId':node_id,
      'classification':classification,'firstAttempt':first,'stateBeforeRecovery':before,'freshSessionRetry':fresh,
      'targetedRefresh':refresh,'stateAfterTargetedRefresh':after_refresh,'postRefreshRetry':post_refresh,
    }
    return (0,first['latencyMs'],diag)

with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
    rows=list(ex.map(one,range(N)))
lat=sorted(v for ok,v,_ in rows if ok); success=sum(ok for ok,_,_ in rows); total=N
failures=[diag for _,_,diag in rows if diag is not None]
def q(p):
    if not lat:return 999999
    return round(lat[min(len(lat)-1,max(0,int((len(lat)-1)*p)))],3)
counts={}
for item in failures: counts[item['classification']]=counts.get(item['classification'],0)+1
summary={'host':host,'firstAttempt':{'success':success,'total':total,'p50Ms':q(.50),'p90Ms':q(.90),'p95Ms':q(.95),'p99Ms':q(.99)},'failureCount':len(failures),'classificationCounts':counts,'failures':failures}
encoded=base64.b64encode(json.dumps(summary,separators=(',',':')).encode()).decode()
print('HEALED_OK='+str(success)); print('HEALED_TOTAL='+str(total)); print('HEALED_P50='+str(q(.50))); print('HEALED_P90='+str(q(.90))); print('HEALED_P95='+str(q(.95))); print('HEALED_P99='+str(q(.99))); print('HEALED_DIAG_B64='+encoded)
PY
EOS
)
  out=$(remote "${VMS[$i]}" "$script")
  ok=$(marker "$out" HEALED_OK); total=$(marker "$out" HEALED_TOTAL); p50=$(marker "$out" HEALED_P50); p90=$(marker "$out" HEALED_P90); p95=$(marker "$out" HEALED_P95); p99=$(marker "$out" HEALED_P99)
  diag_b64=$(marker "$out" HEALED_DIAG_B64)
  python3 - "$i" "$diag_b64" "$healed_diag_jsonl" <<'PYD200HOST'
import base64,json,sys
host=int(sys.argv[1]); raw=sys.argv[2]; path=sys.argv[3]
value=json.loads(base64.b64decode(raw).decode('utf-8'))
if value.get('host') != host: raise SystemExit('healed diagnostic host mismatch')
with open(path,'a',encoding='utf-8') as handle:
    handle.write(json.dumps(value,separators=(',',':'))+'\n')
PYD200HOST
  healed_success=$((healed_success+ok)); healed_total=$((healed_total+total))
  healed_p50=$(python3 -c "print(max(float('$healed_p50'),float('$p50')))" ); healed_p90=$(python3 -c "print(max(float('$healed_p90'),float('$p90')))" )
  healed_p95=$(python3 -c "print(max(float('$healed_p95'),float('$p95')))" ); healed_p99=$(python3 -c "print(max(float('$healed_p99'),float('$p99')))" )
done
healed_rate=$(python3 -c "print(round($healed_success/$healed_total,6))")
python3 - "$healed_diag_jsonl" "$healed_diag_json" "$healed_success" "$healed_total" "$healed_rate" <<'PYD200SUMMARY'
import json,sys
rows=[]
with open(sys.argv[1],encoding='utf-8') as handle:
    for line in handle:
        line=line.strip()
        if line: rows.append(json.loads(line))
counts={}
failures=[]
for row in rows:
    for key,value in (row.get('classificationCounts') or {}).items(): counts[key]=counts.get(key,0)+int(value)
    failures.extend(row.get('failures') or [])
value={'schema':'truyn.d200.healed-reconvergence.v1','firstAttempt':{'success':int(sys.argv[3]),'total':int(sys.argv[4]),'successRatio':float(sys.argv[5])},'classificationCounts':counts,'failureCount':len(failures),'hosts':rows,'failures':failures,'acceptanceUsesFirstAttemptOnly':True,'diagnosticRetriesDoNotChangeHealedGate':True}
with open(sys.argv[2],'w',encoding='utf-8') as handle:
    json.dump(value,handle,separators=(',',':')); handle.write('\n')
PYD200SUMMARY
rm -f "$healed_diag_jsonl"
python3 - <<PY
assert float('$healed_rate') >= .99, '$healed_rate'
PY
echo "TRUYN_CLASS_D_1000 stage=healed-routing success=${healed_success}/${healed_total} routingSuccess=${healed_rate} p50Ms=${healed_p50} p90Ms=${healed_p90} p95Ms=${healed_p95} p99Ms=${healed_p99} status=PASS"

'''

text = text[:start] + new + text[end:]
path.write_text(text)
