#!/usr/bin/env bash
# D-200 write-retention diagnostics. Acceptance remains ack_loss == 0.
# Read/control failures are reported separately from confirmed missing records.

d200_retention_required_margin_ms=900000
d200_retention_start_ms=$(date +%s%3N)
d200_retention_age_start_ms=$((d200_retention_start_ms-d200_write_window_start_ms))
if (( d200_retention_age_start_ms + d200_retention_required_margin_ms >= d200_durable_write_ttl_ms )); then
  echo "TRUYN_D200_WRITE_RETENTION_WINDOW_INVALID phase=before-check ttlMs=${d200_durable_write_ttl_ms} ageMs=${d200_retention_age_start_ms} requiredMarginMs=${d200_retention_required_margin_ms}" >&2
  false
fi

retention_dir="$(mktemp -d)"
retention_jsonl="${GITHUB_WORKSPACE:-$PWD}/class-d-200-write-retention-hosts.jsonl"
retention_json="${GITHUB_WORKSPACE:-$PWD}/class-d-200-write-retention-hosts.json"
: >"$retention_jsonl"
retention_pids=()

for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set +e
python3 - <<'PY'
import json,subprocess
host=${i}; base=${CONTROL_BASE}
rows=[]
for j in range(5):
    key=f'd1000-{host}-{j}'
    url=f'http://127.0.0.1:{base}/find?namespace=class-d1000&key={key}&fanout=24'
    p=subprocess.run(['curl','-sS','--max-time','45','-w','\\n%{http_code}',url],text=True,capture_output=True)
    parts=p.stdout.rsplit('\\n',1) if p.stdout else ['', '']
    body=parts[0] if len(parts)==2 else p.stdout
    code=parts[1].strip() if len(parts)==2 else ''
    row={'key':key,'curlRc':p.returncode,'httpCode':code,'stderr':p.stderr[-256:]}
    if p.returncode!=0 or code!='200':
        row['classification']='read-error'
    else:
        try:
            value=json.loads(body); found=len([r for r in (value.get('records') or []) if r.get('value') is not None])
            row['recordCount']=found
            row['classification']='retained' if found>=1 else 'confirmed-missing'
        except Exception as e:
            row['classification']='read-error'; row['parseError']=type(e).__name__
    rows.append(row)
value={'schema':'truyn.d200.write-retention.host.v1','host':host,'rows':rows,'retained':sum(r['classification']=='retained' for r in rows),'confirmedMissing':sum(r['classification']=='confirmed-missing' for r in rows),'readErrors':sum(r['classification']=='read-error' for r in rows)}
print('RETENTION_HOST_JSON='+json.dumps(value,separators=(',',':')))
PY
EOS
)
  (
    set +e
    remote "${VMS[$i]}" "$script" >"$retention_dir/$i.out" 2>"$retention_dir/$i.err"
    printf '%s\n' "$?" >"$retention_dir/$i.rc"
  ) &
  retention_pids+=("$!")
done
for pid in "${retention_pids[@]}"; do wait "$pid" || true; done

retained=0
retention_confirmed_missing=0
retention_read_errors=0
for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$retention_dir/$i.out" 2>/dev/null || true)"
  err="$(cat "$retention_dir/$i.err" 2>/dev/null || true)"
  remote_rc="$(cat "$retention_dir/$i.rc" 2>/dev/null || echo 99)"
  host_json=$(printf '%s\n' "$out" | sed -n 's/^RETENTION_HOST_JSON=//p' | tail -1)
  if [[ "$remote_rc" != 0 || -z "$host_json" ]]; then
    host_json=$(python3 - "$i" "$remote_rc" "$err" <<'PY'
import json,sys
print(json.dumps({'schema':'truyn.d200.write-retention.host.v1','host':int(sys.argv[1]),'transportError':True,'remoteRc':int(sys.argv[2]),'stderr':sys.argv[3][-1500:],'rows':[],'retained':0,'confirmedMissing':0,'readErrors':5},separators=(',',':')))
PY
)
  fi
  printf '%s\n' "$host_json" >>"$retention_jsonl"
  retained=$((retained+$(printf '%s' "$host_json" | jq -r '.retained // 0')))
  retention_confirmed_missing=$((retention_confirmed_missing+$(printf '%s' "$host_json" | jq -r '.confirmedMissing // 0')))
  retention_read_errors=$((retention_read_errors+$(printf '%s' "$host_json" | jq -r '.readErrors // 0')))
done
rm -rf "$retention_dir"

d200_retention_end_ms=$(date +%s%3N)
d200_retention_age_end_ms=$((d200_retention_end_ms-d200_write_window_start_ms))
if (( d200_retention_age_end_ms >= d200_durable_write_ttl_ms )); then
  echo "TRUYN_D200_WRITE_RETENTION_WINDOW_INVALID phase=after-check ttlMs=${d200_durable_write_ttl_ms} ageMs=${d200_retention_age_end_ms}" >&2
  false
fi
ack_loss=$((writes-retained))
python3 - "$retention_jsonl" "$retention_json" "$writes" "$retained" "$retention_confirmed_missing" "$retention_read_errors" "$ack_loss" <<'PY'
import json,sys
rows=[json.loads(line) for line in open(sys.argv[1],encoding='utf-8') if line.strip()]
value={'schema':'truyn.d200.write-retention.v1','hosts':rows,'acknowledgedWrites':int(sys.argv[3]),'retained':int(sys.argv[4]),'confirmedMissing':int(sys.argv[5]),'readErrors':int(sys.argv[6]),'acknowledgedWriteLoss':int(sys.argv[7]),'lossInterpretation':'confirmedMissing is storage evidence; readErrors are fail-closed reachability/control uncertainty'}
open(sys.argv[2],'w',encoding='utf-8').write(json.dumps(value,separators=(',',':'))+'\n')
PY
rm -f "$retention_jsonl"
echo "TRUYN_CLASS_D_1000 stage=write-retention retained=${retained}/${writes} acknowledgedWriteLoss=${ack_loss} confirmedMissing=${retention_confirmed_missing} readErrors=${retention_read_errors} ttlMs=${d200_durable_write_ttl_ms} ageStartMs=${d200_retention_age_start_ms} ageEndMs=${d200_retention_age_end_ms}"
[[ "$ack_loss" == 0 ]]
[[ "$retention_read_errors" == 0 ]]
