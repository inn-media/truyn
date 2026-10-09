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

def request(url,timeout='45'):
    p=subprocess.run(['curl','-sS','--max-time',timeout,'-w','\\n%{http_code}',url],text=True,capture_output=True)
    parts=p.stdout.rsplit('\\n',1) if p.stdout else ['', '']
    body=parts[0] if len(parts)==2 else p.stdout
    code=parts[1].strip() if len(parts)==2 else ''
    value=None
    if p.returncode==0 and code=='200':
        try:value=json.loads(body)
        except Exception:value=None
    return p,code,value

rows=[]
for j in range(5):
    key=f'd1000-{host}-{j}'
    url=f'http://127.0.0.1:{base}/find?namespace=class-d1000&key={key}&fanout=24'
    p,code,value=request(url)
    row={'key':key,'publisherLocalNode':j,'curlRc':p.returncode,'httpCode':code,'stderr':p.stderr[-256:]}
    if p.returncode!=0 or code!='200' or not isinstance(value,dict):
        row['classification']='read-error'
        if p.returncode==0 and code=='200': row['parseError']='invalid-json'
    else:
        found=len([r for r in (value.get('records') or []) if r.get('value') is not None])
        row['recordCount']=found
        row['readTelemetry']=value.get('readTelemetry')
        row['readFailureCount']=len(value.get('failures') or [])
        row['classification']='retained' if found>=1 else 'confirmed-missing'
        if found==0:
            # Diagnostic only: ask the original publisher process. Its
            # readTelemetry.localRecordCount distinguishes physical publisher
            # retention from a network-placement/lookup miss. This never changes
            # the acceptance classification above.
            publisher_url=f'http://127.0.0.1:{base+j}/find?namespace=class-d1000&key={key}&fanout=3&lookupRounds=0'
            pp,pcode,pvalue=request(publisher_url)
            diag={'curlRc':pp.returncode,'httpCode':pcode,'stderr':pp.stderr[-256:]}
            if isinstance(pvalue,dict):
                diag['recordCount']=len([r for r in (pvalue.get('records') or []) if r.get('value') is not None])
                diag['readTelemetry']=pvalue.get('readTelemetry')
                diag['readFailureCount']=len(pvalue.get('failures') or [])
            status=subprocess.run(['curl','-sS','--max-time','5',f'http://127.0.0.1:{base+j}/status'],text=True,capture_output=True)
            if status.returncode==0:
                try:
                    status_value=json.loads(status.stdout)
                    diag['dhtDurability']=status_value.get('dhtDurability')
                    diag['dhtRecordCount']=status_value.get('dhtRecordCount')
                except Exception:
                    diag['statusParseError']=True
            else:
                diag['statusCurlRc']=status.returncode
                diag['statusStderr']=status.stderr[-256:]
            row['publisherDiagnostic']=diag
    rows.append(row)
value={'schema':'truyn.d200.write-retention.host.v2','host':host,'rows':rows,'retained':sum(r['classification']=='retained' for r in rows),'confirmedMissing':sum(r['classification']=='confirmed-missing' for r in rows),'readErrors':sum(r['classification']=='read-error' for r in rows)}
import base64,gzip,hashlib,pathlib
payload=base64.b64encode(gzip.compress(json.dumps(value,separators=(',',':')).encode('utf-8'),compresslevel=9,mtime=0)).decode('ascii')
payload_path=pathlib.Path('/var/lib/truyn-d1000/retention-host-'+str(host)+'.b64')
payload_path.write_text(payload,encoding='ascii')
print('RETENTION_HOST_SHA256='+hashlib.sha256(payload.encode('ascii')).hexdigest())
print('RETENTION_HOST_BYTES='+str(len(payload)))
print('RETENTION_HOST_CHUNKS='+str((len(payload)+1799)//1800))
PY
EOS
)
  (
    host_status_arm "$retention_dir" "$i"
    trap - ERR
    set +e
    remote "${VMS[$i]}" "$script" >"$retention_dir/$i.out" 2>"$retention_dir/$i.err"
    remote_rc=$?
    printf '%s\n' "$remote_rc" >"$retention_dir/$i.rc"
    exit "$remote_rc"
  ) &
  retention_pids+=("$!")
done
retention_transport_failed=0
if ! wait_host_stage write-retention "$retention_dir" "${retention_pids[@]}"; then retention_transport_failed=1; fi

retained=0
retention_confirmed_missing=0
retention_read_errors=0
for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$retention_dir/$i.out" 2>/dev/null || true)"
  err="$(cat "$retention_dir/$i.err" 2>/dev/null || true)"
  remote_rc="$(cat "$retention_dir/$i.rc" 2>/dev/null || echo 99)"
  # Azure Run Command can truncate large stdout while reporting guest_rc=0.
  # Read an immutable, SHA-checked compressed payload in bounded chunks.
  host_json=''
  report_error=''
  if [[ "$remote_rc" != 0 ]]; then
    report_error=remote_failure
  else
    payload_sha=$(marker "$out" RETENTION_HOST_SHA256)
    payload_bytes=$(marker "$out" RETENTION_HOST_BYTES)
    payload_chunks=$(marker "$out" RETENTION_HOST_CHUNKS)
    if [[ ! "$payload_sha" =~ ^[0-9a-f]{64}$ || ! "$payload_bytes" =~ ^[1-9][0-9]*$ || ! "$payload_chunks" =~ ^[1-9][0-9]*$ || "$payload_chunks" -gt 256 || "$payload_bytes" -gt 460800 ]]; then
      report_error=invalid_payload_manifest
    else
      payload_file="$retention_dir/$i.payload.b64"
      : >"$payload_file"
      for chunk_index in $(seq 0 $((payload_chunks-1))); do
        chunk_script="set -Eeuo pipefail; python3 -c 'from pathlib import Path; p=Path(\"/var/lib/truyn-d1000/retention-host-${i}.b64\"); data=p.read_text(); index=${chunk_index}; print(\"RETENTION_HOST_CHUNK=\"+data[index*1800:(index+1)*1800])'"
        if ! chunk_out=$(remote "${VMS[$i]}" "$chunk_script" 180); then
          report_error=chunk_transport_failure
          break
        fi
        chunk=$(marker "$chunk_out" RETENTION_HOST_CHUNK)
        if [[ ! "$chunk" =~ ^[A-Za-z0-9+/=]+$ || "${#chunk}" -gt 1800 || -z "$chunk" ]]; then
          report_error=invalid_chunk
          break
        fi
        printf '%s' "$chunk" >>"$payload_file"
      done
      if [[ -z "$report_error" ]] && [[ "$(wc -c <"$payload_file" | tr -d ' ')" != "$payload_bytes" || "$(sha256sum "$payload_file" | cut -d' ' -f1)" != "$payload_sha" ]]; then
        report_error=payload_digest_mismatch
      fi
      if [[ -z "$report_error" ]]; then
        if ! host_json=$(base64 -d "$payload_file" | gzip -dc); then
          report_error=payload_decode_failure
        fi
      fi
      if [[ -z "$report_error" ]] && ! printf '%s' "$host_json" | jq -e --argjson host "$i" --arg prefix "d1000-$i-" '
        .schema=="truyn.d200.write-retention.host.v2" and .host==$host
        and (.rows|type=="array" and length==5)
        and ([.rows[].key]|sort)==([range(0;5)|($prefix+tostring)]|sort)
        and ([.rows[].classification]|all(.=="retained" or .=="confirmed-missing" or .=="read-error"))
        and .retained==([.rows[]|select(.classification=="retained")]|length)
        and .confirmedMissing==([.rows[]|select(.classification=="confirmed-missing")]|length)
        and .readErrors==([.rows[]|select(.classification=="read-error")]|length)
        and (.retained+.confirmedMissing+.readErrors)==5
      ' >/dev/null 2>&1; then
        report_error=invalid_host_observations
      fi
    fi
  fi
  if [[ -n "$report_error" ]]; then
    host_json=$(python3 - "$i" "$remote_rc" "$err" "$report_error" <<'PY'
import json,sys
print(json.dumps({'schema':'truyn.d200.write-retention.host.v2','host':int(sys.argv[1]),'transportError':True,'observationError':sys.argv[4],'remoteRc':int(sys.argv[2]),'stderr':sys.argv[3][-1500:],'rows':[],'retained':0,'confirmedMissing':0,'readErrors':5},separators=(',',':')))
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
value={'schema':'truyn.d200.write-retention.v2','hosts':rows,'acknowledgedWrites':int(sys.argv[3]),'retained':int(sys.argv[4]),'confirmedMissing':int(sys.argv[5]),'readErrors':int(sys.argv[6]),'acknowledgedWriteLoss':int(sys.argv[7]),'lossInterpretation':'confirmedMissing is storage evidence; readErrors are fail-closed reachability/control uncertainty'}
open(sys.argv[2],'w',encoding='utf-8').write(json.dumps(value,separators=(',',':'))+'\n')
PY
rm -f "$retention_jsonl"
echo "TRUYN_CLASS_D_1000 stage=write-retention retained=${retained}/${writes} acknowledgedWriteLoss=${ack_loss} confirmedMissing=${retention_confirmed_missing} readErrors=${retention_read_errors} ttlMs=${d200_durable_write_ttl_ms} ageStartMs=${d200_retention_age_start_ms} ageEndMs=${d200_retention_age_end_ms}"
[[ "$ack_loss" == 0 ]]
[[ "$retention_read_errors" == 0 ]]
