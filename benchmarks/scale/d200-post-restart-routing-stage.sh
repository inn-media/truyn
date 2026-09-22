#!/usr/bin/env bash
# Stage-isolated D-200 post-restart routing probe.
# Acceptance remains first-attempt-only >=99%, but diagnostics are collected for
# every host before returning RED.

post_success=0
post_total=0
post_stage_failed=0
post_dir="$(mktemp -d)"
post_jsonl="${GITHUB_WORKSPACE:-$PWD}/class-d-200-post-restart-origin.jsonl"
post_json="${GITHUB_WORKSPACE:-$PWD}/class-d-200-post-restart-origin.json"
post_digest="${GITHUB_WORKSPACE:-$PWD}/class-d-200-post-restart-origin-digest.txt"
: >"$post_jsonl"
post_pids=()

for i in $(seq 0 $((HOST_COUNT-1))); do
  target_host=$(((i+1)%HOST_COUNT))
  script=$(cat <<EOS
set +e
python3 - <<'PY'
import json,subprocess,time
records=json.load(open('/var/lib/truyn-d1000/records-by-host.json'))
host=${i}; target_host=${target_host}; base=${CONTROL_BASE}
rows=[]
for j in range(5,10):
    target=records[target_host][j]['nodeId']
    body=json.dumps({'nodeId':target,'input':{'scenario':'d1000-post-restart','targetLocalNode':j}},separators=(',',':'))
    out=f'/tmp/d1000-post-{j}'
    t=time.perf_counter_ns()
    p=subprocess.run(['curl','-sS','--max-time','15','-o',out,'-w','%{http_code}','-H','content-type: application/json','--data-binary',body,f'http://127.0.0.1:{base}/need'],text=True,capture_output=True)
    code=p.stdout.strip(); body_text=''
    try: body_text=open(out,'r',encoding='utf-8',errors='replace').read(768)
    except Exception: pass
    rows.append({'targetLocalNode':j,'targetNodeId':target,'ok':bool(p.returncode==0 and code=='200'),'curlRc':p.returncode,'httpCode':code,'latencyMs':round((time.perf_counter_ns()-t)/1e6,3),'body':body_text,'stderr':p.stderr[-512:]})
readiness={}
for row in rows:
    if row['ok']: continue
    j=row['targetLocalNode']
    p=subprocess.run(['curl','-sS','--max-time','4',f'http://127.0.0.1:{base+j}/dht/readiness'],text=True,capture_output=True)
    value={'observed':False,'curlRc':p.returncode,'stderr':p.stderr[-256:]}
    if p.returncode==0:
        try:
            r=json.loads(p.stdout); prop=r.get('peerRecordPropagation') or {}; routing=r.get('routing') or {}
            value.update({'observed':True,'acceptanceReady':r.get('acceptanceReady'),'peerRecordPropagationReady':prop.get('ready'),'pendingCount':prop.get('pendingCount'),'validPeers':routing.get('validPeers'),'populatedBuckets':routing.get('populatedBuckets'),'remoteHostCount':(r.get('remoteEndpointDiversity') or {}).get('hostCount')})
        except Exception: value['parseError']=True
    readiness[str(j)]=value
success=sum(1 for r in rows if r['ok'])
value={'schema':'truyn.d200.post-restart-origin.host.v2','host':host,'targetHost':target_host,'firstAttempt':{'success':success,'total':len(rows)},'failures':[r for r in rows if not r['ok']],'targetReadiness':readiness,'acceptanceUsesFirstAttemptOnly':True,'applicationRetryCount':0}
print('POST_HOST_JSON='+json.dumps(value,separators=(',',':')))
PY
EOS
)
  (
    trap - ERR
    set +e
    remote "${VMS[$i]}" "$script" >"$post_dir/$i.out" 2>"$post_dir/$i.err"
    printf '%s\n' "$?" >"$post_dir/$i.rc"
  ) &
  post_pids+=("$!")
done

for pid in "${post_pids[@]}"; do wait "$pid" || true; done

for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$post_dir/$i.out" 2>/dev/null || true)"
  err="$(cat "$post_dir/$i.err" 2>/dev/null || true)"
  remote_rc="$(cat "$post_dir/$i.rc" 2>/dev/null || echo 99)"
  host_json=$(printf '%s\n' "$out" | sed -n 's/^POST_HOST_JSON=//p' | tail -1)
  if [[ "$remote_rc" != 0 || -z "$host_json" ]]; then
    post_stage_failed=1
    host_json=$(python3 - "$i" "$remote_rc" "$err" <<'PY'
import json,sys
print(json.dumps({'schema':'truyn.d200.post-restart-origin.host.v2','host':int(sys.argv[1]),'transportError':True,'remoteRc':int(sys.argv[2]),'stderr':sys.argv[3][-1500:],'firstAttempt':{'success':0,'total':5},'failures':[],'targetReadiness':{},'acceptanceUsesFirstAttemptOnly':True,'applicationRetryCount':0},separators=(',',':')))
PY
)
  fi
  printf '%s\n' "$host_json" >>"$post_jsonl"
  ok=$(printf '%s' "$host_json" | jq -r '.firstAttempt.success // 0')
  total=$(printf '%s' "$host_json" | jq -r '.firstAttempt.total // 5')
  post_success=$((post_success+ok)); post_total=$((post_total+total))
  echo "TRUYN_CLASS_D_1000 stage=post-restart-routing host=$i firstAttempt=${ok}/${total} applicationRetries=0"
done
rm -rf "$post_dir"

post_rate=$(python3 -c "print(round($post_success/$post_total,6) if $post_total else 0.0)")
python3 - "$post_jsonl" "$post_json" "$post_success" "$post_total" "$post_rate" <<'PY'
import json,sys
rows=[json.loads(line) for line in open(sys.argv[1],encoding='utf-8') if line.strip()]
value={'schema':'truyn.d200.post-restart-origin.v2','hosts':rows,'firstAttempt':{'success':int(sys.argv[3]),'total':int(sys.argv[4]),'successRatio':float(sys.argv[5])},'failureCount':sum(len(r.get('failures') or []) for r in rows),'transportErrorHosts':[r['host'] for r in rows if r.get('transportError')],'acceptanceUsesFirstAttemptOnly':True,'applicationRetryCount':0,'allHostsObserved':len(rows)}
open(sys.argv[2],'w',encoding='utf-8').write(json.dumps(value,separators=(',',':'))+'\n')
PY
sha256sum "$post_json" | awk '{print "sha256:"$1}' >"$post_digest"
rm -f "$post_jsonl"

if ! python3 -c "assert float('$post_rate') >= .99"; then post_stage_failed=1; fi
echo "TRUYN_CLASS_D_1000 stage=post-restart-routing success=${post_success}/${post_total} routingSuccess=${post_rate} firstAttemptOnly=true applicationRetries=0 hostsObserved=${HOST_COUNT}"
[[ "$post_stage_failed" == 0 ]]
