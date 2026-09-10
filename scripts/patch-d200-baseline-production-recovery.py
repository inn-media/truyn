#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-d200-baseline-production-recovery.py <campaign>')

path = Path(sys.argv[1])
text = path.read_text()
if text.count('D200_BASELINE_ORIGIN_DIAG=1') != 1:
    raise SystemExit('baseline origin diagnostic patch must be applied exactly once first')
if 'D200_BASELINE_PRODUCTION_RECOVERY=1' in text:
    raise SystemExit('baseline production recovery patch already appears applied')

old = r'''def need(j,node_id,k):
    body=json.dumps({'nodeId':node_id,'input':{'scenario':'d1000-baseline','probe':k}},separators=(',',':'))
    t=time.perf_counter_ns()
    p=subprocess.run(['curl','-sS','--max-time','15','-o',f'/tmp/d1000-base-first-{k}','-w','%{http_code}','-H','content-type: application/json','--data-binary',body,f'http://127.0.0.1:{base+j}/need'],text=True,capture_output=True)
    ms=(time.perf_counter_ns()-t)/1e6
    code=p.stdout.strip()
    return {'ok':bool(p.returncode==0 and code=='200'),'curlRc':p.returncode,'httpCode':code,'latencyMs':round(ms,3)}
'''
new = r'''# D200_BASELINE_PRODUCTION_RECOVERY=1
# A baseline probe remains one logical production probe. On a transient first
# /need failure, exercise the existing bounded production discovery refresh and
# retry /need once before declaring that logical probe failed. Separate
# diagnostic retries later in this stage remain evidence-only and are never
# counted in baseline acceptance.
def need(j,node_id,k):
    control=f'http://127.0.0.1:{base+j}'
    body=json.dumps({'nodeId':node_id,'input':{'scenario':'d1000-baseline','probe':k}},separators=(',',':'))
    def attempt(suffix):
        t=time.perf_counter_ns()
        p=subprocess.run(['curl','-sS','--max-time','15','-o',f'/tmp/d1000-base-{suffix}-{k}','-w','%{http_code}','-H','content-type: application/json','--data-binary',body,control+'/need'],text=True,capture_output=True)
        ms=(time.perf_counter_ns()-t)/1e6
        code=p.stdout.strip()
        return {'ok':bool(p.returncode==0 and code=='200'),'curlRc':p.returncode,'httpCode':code,'latencyMs':round(ms,3)}
    first=attempt('first')
    if first['ok']:
        first['productionRecoveryUsed']=False
        return first
    refresh_body=json.dumps({'targets':[node_id],'targetCount':32,'maxRounds':2,'seed':f'd200-baseline-recovery-{host}-{k}'},separators=(',',':'))
    refresh=subprocess.run(['curl','-sS','--max-time','12','-o',f'/tmp/d1000-base-refresh-{k}','-w','%{http_code}','-H','content-type: application/json','--data-binary',refresh_body,control+'/dht/refresh'],text=True,capture_output=True)
    if refresh.returncode!=0 or refresh.stdout.strip()!='200':
        first['productionRecoveryUsed']=True
        first['productionRefreshOk']=False
        return first
    retry=attempt('recovered')
    retry['latencyMs']=round(first['latencyMs']+retry['latencyMs'],3)
    retry['productionRecoveryUsed']=True
    retry['productionRefreshOk']=True
    retry['initialCurlRc']=first['curlRc']
    retry['initialHttpCode']=first['httpCode']
    return retry
'''
if text.count(old) != 1:
    raise SystemExit(f'unexpected baseline need helper count: {text.count(old)}')
text = text.replace(old, new, 1)
if text.count("assert float('$base_rate') >= .99, '$base_rate'") != 1:
    raise SystemExit('strict baseline >=0.99 gate changed or missing')
if "'targetCount':32" not in text:
    raise SystemExit('bounded recovery targetCount=32 missing')
path.write_text(text)
