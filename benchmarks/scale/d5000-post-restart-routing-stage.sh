#!/usr/bin/env bash
# D-5000 post-restart routing probe. Acceptance is identical to the shared D-200
# stage: first attempt only, >=99%, zero application retries, nodes 5-9 of the next
# host. Differences are evidence-only and stricter:
#  - success requires HTTP 200 AND a body proving the restarted target answered;
#  - every failure records the source node's own view of the target (/dht/peer);
#  - target readiness is observed on the TARGET host (the shared stage queried
#    127.0.0.1:${CONTROL_BASE+j} on the source host, i.e. an unrelated local node).

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
import json,subprocess,time,urllib.parse
records=json.load(open('/var/lib/truyn-d1000/records-by-host.json'))
host=${i}; target_host=${target_host}; base=${CONTROL_BASE}
def get(path, timeout=4):
    p=subprocess.run(['curl','-sS','--max-time',str(timeout),f'http://127.0.0.1:{base}{path}'],text=True,capture_output=True)
    if p.returncode!=0: return {'observed':False,'curlRc':p.returncode,'stderr':p.stderr[-256:]}
    try: return {'observed':True,**json.loads(p.stdout)}
    except Exception: return {'observed':False,'parseError':True,'raw':p.stdout[:256]}
rows=[]
for j in range(5,10):
    target=records[target_host][j]['nodeId']
    body=json.dumps({'nodeId':target,'input':{'scenario':'d1000-post-restart','targetLocalNode':j}},separators=(',',':'))
    out=f'/tmp/d5000-post-{host}-{j}'
    t=time.perf_counter_ns()
    p=subprocess.run(['curl','-sS','--max-time','15','-o',out,'-w','%{http_code}','-H','content-type: application/json','--data-binary',body,f'http://127.0.0.1:{base}/need'],text=True,capture_output=True)
    latency=round((time.perf_counter_ns()-t)/1e6,3)
    code=p.stdout.strip(); body_text=''
    try: body_text=open(out,'r',encoding='utf-8',errors='replace').read(1024)
    except Exception: pass
    answered=False; transport=None
    try:
        parsed=json.loads(body_text); result=parsed.get('result') or {}; transport=parsed.get('transport')
        answered=result.get('to')==target and (result.get('echo') or {}).get('targetLocalNode')==j
    except Exception: pass
    row={'targetLocalNode':j,'targetNodeId':target,'ok':bool(p.returncode==0 and code=='200' and answered),'curlRc':p.returncode,'httpCode':code,'targetAnswered':answered,'transport':transport,'latencyMs':latency,'body':body_text[:768],'stderr':p.stderr[-512:]}
    if not row['ok']:
        row['sourcePeerView']=get('/dht/peer?nodeId='+urllib.parse.quote(target,safe=''))
    rows.append(row)
success=sum(1 for r in rows if r['ok'])
value={'schema':'truyn.d5000.post-restart-origin.host.v3','host':host,'targetHost':target_host,'firstAttempt':{'success':success,'total':len(rows)},'failures':[r for r in rows if not r['ok']],'acceptanceUsesFirstAttemptOnly':True,'applicationRetryCount':0}
print('POST_HOST_JSON='+json.dumps(value,separators=(',',':')))
PY
EOS
)
  (
    host_status_arm "$post_dir" "$i"
    trap - ERR
    set +e
    remote "${VMS[$i]}" "$script" >"$post_dir/$i.out" 2>"$post_dir/$i.err"
    remote_rc=$?
    printf '%s\n' "$remote_rc" >"$post_dir/$i.rc"
    exit "$remote_rc"
  ) &
  post_pids+=("$!")
done

post_transport_failed=0
if ! wait_host_stage post-restart-routing "$post_dir" "${post_pids[@]}"; then post_transport_failed=1; fi
[[ "$post_transport_failed" == 0 ]] || post_stage_failed=1

declare -A post_failed_targets=()
for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$post_dir/$i.out" 2>/dev/null || true)"
  err="$(cat "$post_dir/$i.err" 2>/dev/null || true)"
  remote_rc="$(cat "$post_dir/$i.rc" 2>/dev/null || echo 99)"
  host_json=$(printf '%s\n' "$out" | sed -n 's/^POST_HOST_JSON=//p' | tail -1)
  # Azure Run Command may return guest_rc=0 but truncate a large marker.
  # Reject invalid or partial evidence, preserving fail-closed first-attempt counts.
  if [[ "$remote_rc" != 0 || -z "$host_json" ]] ||
     ! printf '%s' "$host_json" | jq -e --argjson host "$i" '
       .schema=="truyn.d5000.post-restart-origin.host.v3" and
       .host==$host and .firstAttempt.total==5 and
       (.firstAttempt.success|type)=="number" and
       .firstAttempt.success>=0 and .firstAttempt.success<=5 and
       (.failures|type)=="array" and
       (.failures|length)==(5-.firstAttempt.success) and
       .acceptanceUsesFirstAttemptOnly==true and .applicationRetryCount==0
     ' >/dev/null 2>&1; then
    post_stage_failed=1
    host_json=$(python3 - "$i" "$remote_rc" "$err" <<'PY'
import json,sys
print(json.dumps({'schema':'truyn.d5000.post-restart-origin.host.v3','host':int(sys.argv[1]),'transportError':True,'remoteRc':int(sys.argv[2]),'stderr':sys.argv[3][-1500:],'firstAttempt':{'success':0,'total':5},'failures':[],'acceptanceUsesFirstAttemptOnly':True,'applicationRetryCount':0},separators=(',',':')))
PY
)
  fi
  printf '%s\n' "$host_json" >"$post_dir/$i.json"
  failed_nodes=$(printf '%s' "$host_json" | jq -r '[.failures[]?.targetLocalNode] | map(tostring) | join(" ")')
  if [[ -n "$failed_nodes" ]]; then post_failed_targets[$(((i+1)%HOST_COUNT))]="$failed_nodes"; fi
  ok=$(printf '%s' "$host_json" | jq -r '.firstAttempt.success // 0')
  total=$(printf '%s' "$host_json" | jq -r '.firstAttempt.total // 5')
  post_success=$((post_success+ok)); post_total=$((post_total+total))
  echo "TRUYN_CLASS_D_1000 stage=post-restart-routing host=$i firstAttempt=${ok}/${total} applicationRetries=0"
done

# Diagnostic only (after the first-attempt result is fixed): observe each failed
# target on its own host. Never changes acceptance; failures here are recorded.
obs_pids=()
for target_host in "${!post_failed_targets[@]}"; do
  nodes="${post_failed_targets[$target_host]}"
  script=$(cat <<EOS
set +e
python3 - <<'PY'
import json,subprocess
base=${CONTROL_BASE}; host=${target_host}; per=${NODES_PER_HOST}
def get(port,path):
    p=subprocess.run(['curl','-sS','--max-time','4',f'http://127.0.0.1:{port}{path}'],text=True,capture_output=True)
    if p.returncode!=0: return {'observed':False,'curlRc':p.returncode}
    try: return {'observed':True,**json.loads(p.stdout)}
    except Exception: return {'observed':False,'parseError':True}
out={}
for j in [int(x) for x in '${nodes}'.split()]:
    r=get(base+j,'/dht/readiness'); rec=(get(base+j,'/record').get('record') or {})
    unit=subprocess.run(['systemctl','show',f'truyn-d1000@{host*per+j}.service','-p','ActiveState','-p','NRestarts','-p','ActiveEnterTimestamp'],text=True,capture_output=True).stdout
    prop=r.get('peerRecordPropagation') or {}
    out[str(j)]={'observedOnHost':host,'readinessObserved':r.get('observed'),'acceptanceReady':r.get('acceptanceReady'),'propagationReady':prop.get('ready'),'pendingCount':prop.get('pendingCount'),'validPeers':(r.get('routing') or {}).get('validPeers'),'instanceId':rec.get('instanceId'),'sequence':rec.get('sequence'),'unit':dict(line.split('=',1) for line in unit.splitlines() if '=' in line)}
print('POST_TARGET_JSON='+json.dumps(out,separators=(',',':')))
PY
EOS
)
  (
    trap - ERR
    set +e
    remote "${VMS[$target_host]}" "$script" 180 >"$post_dir/target-$target_host.out" 2>/dev/null
    exit 0
  ) &
  obs_pids+=("$!")
done
for pid in "${obs_pids[@]}"; do wait "$pid" || true; done

for i in $(seq 0 $((HOST_COUNT-1))); do
  target_host=$(((i+1)%HOST_COUNT))
  observed=$(sed -n 's/^POST_TARGET_JSON=//p' "$post_dir/target-$target_host.out" 2>/dev/null | tail -1)
  # Secondary diagnostics must never abort evidence assembly if the Azure
  # response is truncated; mark unavailable, never convert a failure into PASS.
  if ! printf '%s' "${observed:-}" | jq -e 'type=="object"' >/dev/null 2>&1; then observed=null; fi
  if [[ -n "${post_failed_targets[$target_host]:-}" ]]; then
    jq -c --argjson obs "${observed:-null}" '. + {targetObservations: ($obs // {observationUnavailable: true})}' "$post_dir/$i.json" >>"$post_jsonl"
  else
    cat "$post_dir/$i.json" >>"$post_jsonl"
  fi
done
rm -rf "$post_dir"

post_rate=$(python3 -c "print(round($post_success/$post_total,6) if $post_total else 0.0)")
python3 - "$post_jsonl" "$post_json" "$post_success" "$post_total" "$post_rate" <<'PY'
import json,sys
rows=[json.loads(line) for line in open(sys.argv[1],encoding='utf-8') if line.strip()]
value={'schema':'truyn.d5000.post-restart-origin.v3','hosts':rows,'firstAttempt':{'success':int(sys.argv[3]),'total':int(sys.argv[4]),'successRatio':float(sys.argv[5])},'failureCount':sum(len(r.get('failures') or []) for r in rows),'transportErrorHosts':[r['host'] for r in rows if r.get('transportError')],'successRequiresTargetAnswer':True,'acceptanceUsesFirstAttemptOnly':True,'applicationRetryCount':0,'allHostsObserved':len(rows)}
open(sys.argv[2],'w',encoding='utf-8').write(json.dumps(value,separators=(',',':'))+'\n')
PY
sha256sum "$post_json" | awk '{print "sha256:"$1}' >"$post_digest"
rm -f "$post_jsonl"

if ! python3 -c "assert float('$post_rate') >= .99"; then post_stage_failed=1; fi
echo "TRUYN_CLASS_D_1000 stage=post-restart-routing success=${post_success}/${post_total} routingSuccess=${post_rate} firstAttemptOnly=true applicationRetries=0 hostsObserved=${HOST_COUNT}"
[[ "$post_stage_failed" == 0 ]]
