#!/usr/bin/env bash
# D-200 resource diagnostics. Observe every host before failing the stage.

rss_kb=0
quic_bytes=0
process_total=0
resources_stage_failed=0
resources_dir="$(mktemp -d)"
resources_jsonl="${GITHUB_WORKSPACE:-$PWD}/class-d-200-resources-hosts.jsonl"
resources_json="${GITHUB_WORKSPACE:-$PWD}/class-d-200-resources-hosts.json"
: >"$resources_jsonl"
resources_pids=()

for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set +e
rss=\$(ps -eo rss,args | awk '/network\/testnet\/node-service.js/ && !/awk/ {s+=\$1} END{print s+0}')
proc=\$(pgrep -fc 'network/testnet/node-service.js')
outb=\$(iptables-save -c | awk '/truyn-d1000-meter-out/ {gsub(/\\[/,"",\$1); split(\$1,a,":"); s+=a[2]} END{print s+0}')
inb=\$(iptables-save -c | awk '/truyn-d1000-meter-in/ {gsub(/\\[/,"",\$1); split(\$1,a,":"); s+=a[2]} END{print s+0}')
echo RSS_KB=\$rss
echo PROCESSES=\$proc
echo QUIC_BYTES=\$((outb+inb))
if [[ \$proc -lt ${NODES_PER_HOST} ]]; then
  echo MISSING_PROCESS_DIAG_BEGIN=1
  for j in \$(seq 0 $((NODES_PER_HOST-1))); do
    idx=\$(( ${i} * ${NODES_PER_HOST} + j ))
    unit=truyn-d1000@\${idx}.service
    active=\$(systemctl show "\$unit" -p ActiveState --value 2>/dev/null)
    sub=\$(systemctl show "\$unit" -p SubState --value 2>/dev/null)
    result=\$(systemctl show "\$unit" -p Result --value 2>/dev/null)
    pid=\$(systemctl show "\$unit" -p MainPID --value 2>/dev/null)
    restarts=\$(systemctl show "\$unit" -p NRestarts --value 2>/dev/null)
    status=\$(systemctl show "\$unit" -p ExecMainStatus --value 2>/dev/null)
    [[ "\$active" == active ]] || echo "MISSING_UNIT=\$unit active=\$active sub=\$sub result=\$result pid=\$pid restarts=\$restarts execStatus=\$status"
  done
  dmesg 2>/dev/null | grep -Ei 'out of memory|oom|killed process' | tail -n 20 | sed 's/^/KERNEL_DIAG=/'
fi
exit 0
EOS
)
  (
    trap - ERR
    set +e
    remote "${VMS[$i]}" "$script" >"$resources_dir/$i.out" 2>"$resources_dir/$i.err"
    printf '%s\n' "$?" >"$resources_dir/$i.rc"
  ) &
  resources_pids+=("$!")
done
for pid in "${resources_pids[@]}"; do wait "$pid" || true; done

for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$resources_dir/$i.out" 2>/dev/null || true)"
  err="$(cat "$resources_dir/$i.err" 2>/dev/null || true)"
  remote_rc="$(cat "$resources_dir/$i.rc" 2>/dev/null || echo 99)"
  p=$(marker "$out" PROCESSES); r=$(marker "$out" RSS_KB); q=$(marker "$out" QUIC_BYTES)
  [[ "$p" =~ ^[0-9]+$ ]] || p=0
  [[ "$r" =~ ^[0-9]+$ ]] || r=0
  [[ "$q" =~ ^[0-9]+$ ]] || q=0
  if [[ "$remote_rc" != 0 || "$p" -lt "$NODES_PER_HOST" ]]; then resources_stage_failed=1; fi
  process_total=$((process_total+p)); rss_kb=$((rss_kb+r)); quic_bytes=$((quic_bytes+q))
  diag=$(printf '%s\n%s\n' "$out" "$err" | grep -E 'MISSING_UNIT=|KERNEL_DIAG=' | tail -n 80 || true)
  python3 - "$resources_jsonl" "$i" "$remote_rc" "$p" "$r" "$q" "$diag" <<'PY'
import json,sys
path=sys.argv[1]
value={'host':int(sys.argv[2]),'remoteRc':int(sys.argv[3]),'processes':int(sys.argv[4]),'rssKb':int(sys.argv[5]),'quicBytes':int(sys.argv[6]),'diagnostics':sys.argv[7][-8000:]}
with open(path,'a',encoding='utf-8') as h:h.write(json.dumps(value,separators=(',',':'))+'\n')
PY
  echo "TRUYN_CLASS_D_1000 stage=resources host=$i processes=${p}/${NODES_PER_HOST} rssKb=${r} quicBytes=${q} remoteRc=${remote_rc}"
done
rm -rf "$resources_dir"
python3 - "$resources_jsonl" "$resources_json" "$process_total" "$rss_kb" "$quic_bytes" <<'PY'
import json,sys
rows=[json.loads(line) for line in open(sys.argv[1],encoding='utf-8') if line.strip()]
value={'schema':'truyn.d200.resources.v1','hosts':rows,'observedNodeProcesses':int(sys.argv[3]),'aggregateNodeRssKb':int(sys.argv[4]),'measuredQuicUdpBytes':int(sys.argv[5]),'hostsBelowExpected':[r['host'] for r in rows if r['processes'] < 10 or r['remoteRc'] != 0]}
open(sys.argv[2],'w',encoding='utf-8').write(json.dumps(value,separators=(',',':'))+'\n')
PY
rm -f "$resources_jsonl"
[[ "$process_total" -ge "$NODE_COUNT" ]] || resources_stage_failed=1
echo "TRUYN_CLASS_D_1000 stage=resources observedNodeProcesses=${process_total}/${NODE_COUNT} aggregateNodeRssKb=${rss_kb} measuredQuicUdpBytes=${quic_bytes} hostsObserved=${HOST_COUNT}"
[[ "$resources_stage_failed" == 0 ]]
