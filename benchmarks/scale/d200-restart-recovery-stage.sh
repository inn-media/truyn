#!/usr/bin/env bash
# Stage-isolated D-200 restart/recovery acceptance implementation.
# Logical readiness failures are emitted as data instead of aborting the remote
# script before STOP/START/READY/RESTART markers can be collected.

restart_dir="$(mktemp -d)"
restart_jsonl="${GITHUB_WORKSPACE:-$PWD}/class-d-200-restart-recovery-hosts.jsonl"
restart_json="${GITHUB_WORKSPACE:-$PWD}/class-d-200-restart-recovery-hosts.json"
restart_log="${GITHUB_WORKSPACE:-$PWD}/class-d-200-restart-recovery-host-output.log"
: >"$restart_jsonl"
: >"$restart_log"
restart_pids=()

restart_first_node=5
restart_last_node=9
restarted_nodes_per_host=$((restart_last_node-restart_first_node+1))
restarted_total=$((HOST_COUNT*restarted_nodes_per_host))
[[ "$NODES_PER_HOST" -gt "$restart_last_node" ]]

d200_restart_exact_marker() {
  local text="$1" key="$2"
  printf '%s\n' "$text" | sed -n "s/^${key}=//p" | tail -1 | tr -d '\r'
}

for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
t0=\$(date +%s%3N)
logical_rc=0
stop_pids=()
for j in \$(seq ${restart_first_node} ${restart_last_node}); do
  idx=\$(( ${i} * ${NODES_PER_HOST} + j ))
  systemctl stop truyn-d1000@\${idx}.service &
  stop_pids+=("\$!")
done
stop_failed=0
for pid in "\${stop_pids[@]}"; do
  if ! wait "\$pid"; then stop_failed=1; fi
done
if [[ "\$stop_failed" != 0 ]]; then logical_rc=1; fi
t_stop=\$(date +%s%3N)
stop_ms=\$((t_stop-t0))
sleep 2
t_start0=\$(date +%s%3N)
start_pids=()
for j in \$(seq ${restart_first_node} ${restart_last_node}); do
  idx=\$(( ${i} * ${NODES_PER_HOST} + j ))
  systemctl start truyn-d1000@\${idx}.service &
  start_pids+=("\$!")
done
start_failed=0
for pid in "\${start_pids[@]}"; do
  if ! wait "\$pid"; then start_failed=1; fi
done
if [[ "\$start_failed" != 0 ]]; then logical_rc=1; fi
t_start=\$(date +%s%3N)
start_ms=\$((t_start-t_start0))
t_ready0=\$(date +%s%3N)
good=0
min_valid=999999
min_buckets=999999
min_hosts=999999
max_pending=0
last_bad_node=-1
last_acceptance_ready=unknown
last_pending=-1
last_valid=-1
last_buckets=-1
last_hosts=-1
last_refresh_status=unknown
last_propagation_ready=unknown
for n in \$(seq 1 90); do
  good=0
  min_valid=999999
  min_buckets=999999
  min_hosts=999999
  max_pending=0
  last_bad_node=-1
  for j in \$(seq ${restart_first_node} ${restart_last_node}); do
    control_url="http://127.0.0.1:\$(( ${CONTROL_BASE}+j ))"
    readiness=''
    if readiness=\$(curl -fsS --max-time 2 "\${control_url}/dht/readiness" 2>/dev/null); then
      acceptance_ready=\$(printf '%s' "\$readiness" | jq -r '.acceptanceReady == true and .peerRecordPropagation.ready == true' 2>/dev/null || echo false)
      propagation_ready=\$(printf '%s' "\$readiness" | jq -r '.peerRecordPropagation.ready // false' 2>/dev/null || echo false)
      pending=\$(printf '%s' "\$readiness" | jq -r '.peerRecordPropagation.pendingCount // 999999' 2>/dev/null || echo 999999)
      valid=\$(printf '%s' "\$readiness" | jq -r '.validPeers // 0' 2>/dev/null || echo 0)
      buckets=\$(printf '%s' "\$readiness" | jq -r '.populatedBuckets // 0' 2>/dev/null || echo 0)
      hosts=\$(printf '%s' "\$readiness" | jq -r '.remoteEndpointDiversity.hostCount // 0' 2>/dev/null || echo 0)
      refresh_status=\$(printf '%s' "\$readiness" | jq -r '.refresh.status // "unknown"' 2>/dev/null || echo unknown)
      if [[ "\$valid" =~ ^[0-9]+$ && "\$valid" -lt "\$min_valid" ]]; then min_valid="\$valid"; fi
      if [[ "\$buckets" =~ ^[0-9]+$ && "\$buckets" -lt "\$min_buckets" ]]; then min_buckets="\$buckets"; fi
      if [[ "\$hosts" =~ ^[0-9]+$ && "\$hosts" -lt "\$min_hosts" ]]; then min_hosts="\$hosts"; fi
      if [[ "\$pending" =~ ^[0-9]+$ && "\$pending" -gt "\$max_pending" ]]; then max_pending="\$pending"; fi
      if [[ "\$acceptance_ready" == true &&
            "\$pending" == 0 &&
            "\$valid" -ge ${BOOTSTRAP_MAX_PEERS_PER_NODE} &&
            "\$buckets" -gt 0 &&
            "\$hosts" -ge 2 ]]; then
        good=\$((good+1))
      else
        last_bad_node=\$j
        last_acceptance_ready=\$acceptance_ready
        last_propagation_ready=\$propagation_ready
        last_pending=\$pending
        last_valid=\$valid
        last_buckets=\$buckets
        last_hosts=\$hosts
        last_refresh_status=\$refresh_status
      fi
    else
      last_bad_node=\$j
      last_acceptance_ready=false
      last_propagation_ready=false
      last_pending=999999
      last_valid=0
      last_buckets=0
      last_hosts=0
      last_refresh_status=curl-failed
    fi
  done
  [[ \$good -eq ${restarted_nodes_per_host} ]] && break
  sleep 1
done
if [[ "\$good" -ne ${restarted_nodes_per_host} ]]; then logical_rc=1; fi
t1=\$(date +%s%3N)
ready_ms=\$((t1-t_ready0))
restart_ms=\$((t1-t0))
echo STOP_MS=\$stop_ms
echo START_MS=\$start_ms
echo READY_MS=\$ready_ms
echo RESTART_MS=\$restart_ms
echo READY=\$good
echo READY_MIN_VALID=\$min_valid
echo READY_MIN_BUCKETS=\$min_buckets
echo READY_MIN_HOSTS=\$min_hosts
echo READY_MAX_PENDING=\$max_pending
echo RESTART_STOP_FAILED=\$stop_failed
echo RESTART_START_FAILED=\$start_failed
echo RESTART_LAST_BAD_NODE=\$last_bad_node
echo RESTART_LAST_ACCEPTANCE_READY=\$last_acceptance_ready
echo RESTART_LAST_PROPAGATION_READY=\$last_propagation_ready
echo RESTART_LAST_PENDING=\$last_pending
echo RESTART_LAST_VALID=\$last_valid
echo RESTART_LAST_BUCKETS=\$last_buckets
echo RESTART_LAST_HOSTS=\$last_hosts
echo RESTART_LAST_REFRESH_STATUS=\$last_refresh_status
echo RESTART_LOGICAL_RC=\$logical_rc
# Keep the Azure RunCommand transport successful for logical predicate failures
# so remote() does not retry and repeat a restart. Parent acceptance interprets
# RESTART_LOGICAL_RC and READY instead.
exit 0
EOS
)
  (
    trap - ERR
    set +e
    remote "${VMS[$i]}" "$script" >"$restart_dir/$i.out" 2>"$restart_dir/$i.err"
    printf '%s\n' "$?" >"$restart_dir/$i.remote_rc"
  ) &
  restart_pids+=("$!")
done

for pid in "${restart_pids[@]}"; do wait "$pid" || true; done

stop_values=()
start_values=()
ready_values=()
recovery_values=()
restart_hosts_pass=0
restart_hosts_total=$HOST_COUNT
restart_stage_failed=0

for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$restart_dir/$i.out" 2>/dev/null || true)"
  err="$(cat "$restart_dir/$i.err" 2>/dev/null || true)"
  remote_rc="$(cat "$restart_dir/$i.remote_rc" 2>/dev/null || echo 99)"

  stop_ms=$(d200_restart_exact_marker "$out" STOP_MS); start_ms=$(d200_restart_exact_marker "$out" START_MS)
  ready_ms=$(d200_restart_exact_marker "$out" READY_MS); restart_ms=$(d200_restart_exact_marker "$out" RESTART_MS)
  ready=$(d200_restart_exact_marker "$out" READY); logical_rc=$(d200_restart_exact_marker "$out" RESTART_LOGICAL_RC)
  ready_min_valid=$(d200_restart_exact_marker "$out" READY_MIN_VALID); ready_min_buckets=$(d200_restart_exact_marker "$out" READY_MIN_BUCKETS)
  ready_min_hosts=$(d200_restart_exact_marker "$out" READY_MIN_HOSTS); ready_max_pending=$(d200_restart_exact_marker "$out" READY_MAX_PENDING)
  stop_failed=$(d200_restart_exact_marker "$out" RESTART_STOP_FAILED); start_failed=$(d200_restart_exact_marker "$out" RESTART_START_FAILED)
  last_bad_node=$(d200_restart_exact_marker "$out" RESTART_LAST_BAD_NODE); last_acceptance_ready=$(d200_restart_exact_marker "$out" RESTART_LAST_ACCEPTANCE_READY)
  last_propagation_ready=$(d200_restart_exact_marker "$out" RESTART_LAST_PROPAGATION_READY); last_pending=$(d200_restart_exact_marker "$out" RESTART_LAST_PENDING)
  last_valid=$(d200_restart_exact_marker "$out" RESTART_LAST_VALID); last_buckets=$(d200_restart_exact_marker "$out" RESTART_LAST_BUCKETS)
  last_hosts=$(d200_restart_exact_marker "$out" RESTART_LAST_HOSTS); last_refresh_status=$(d200_restart_exact_marker "$out" RESTART_LAST_REFRESH_STATUS)

  ready_assertion=false
  if [[ "$ready" == "$restarted_nodes_per_host" ]]; then ready_assertion=true; fi

  markers_complete=true
  for value in "$stop_ms" "$start_ms" "$ready_ms" "$restart_ms" "$ready" "$logical_rc" "$ready_min_valid" "$ready_min_buckets" "$ready_min_hosts" "$ready_max_pending"; do
    [[ -n "$value" ]] || markers_complete=false
  done

  host_status=PASS
  if [[ "$remote_rc" != 0 || "$logical_rc" != 0 || "$ready_assertion" != true || "$markers_complete" != true ]]; then
    host_status=RED
    restart_stage_failed=1
    echo "TRUYN_D200_RESTART_HOST_FAILURE host=$i remoteRc=${remote_rc} logicalRc=${logical_rc:-missing} ready=${ready:-missing}/${restarted_nodes_per_host} markersComplete=${markers_complete} lastBadNode=${last_bad_node:-unknown} acceptanceReady=${last_acceptance_ready:-unknown} propagationReady=${last_propagation_ready:-unknown} pending=${last_pending:-unknown} valid=${last_valid:-unknown} buckets=${last_buckets:-unknown} remoteHosts=${last_hosts:-unknown} refresh=${last_refresh_status:-unknown}" >&2
  else
    restart_hosts_pass=$((restart_hosts_pass+1))
  fi

  if [[ "$stop_ms" =~ ^[0-9]+$ ]]; then stop_values+=("$stop_ms"); fi
  if [[ "$start_ms" =~ ^[0-9]+$ ]]; then start_values+=("$start_ms"); fi
  if [[ "$ready_ms" =~ ^[0-9]+$ ]]; then ready_values+=("$ready_ms"); fi
  if [[ "$restart_ms" =~ ^[0-9]+$ ]]; then recovery_values+=("$restart_ms"); fi

  python3 - "$restart_jsonl" "$i" "$host_status" "$remote_rc" "${logical_rc:-99}" "${ready:-0}" "${stop_ms:-}" "${start_ms:-}" "${ready_ms:-}" "${restart_ms:-}" "${ready_min_valid:-}" "${ready_min_buckets:-}" "${ready_min_hosts:-}" "${ready_max_pending:-}" "${stop_failed:-}" "${start_failed:-}" "${last_bad_node:-}" "${last_acceptance_ready:-}" "${last_propagation_ready:-}" "${last_pending:-}" "${last_valid:-}" "${last_buckets:-}" "${last_hosts:-}" "${last_refresh_status:-}" "$markers_complete" "$err" <<'PYD200RESTART'
import json, sys
path=sys.argv[1]
def n(raw):
    try:return int(raw)
    except:return None
value={
 'host':int(sys.argv[2]),'status':sys.argv[3],'remoteRc':n(sys.argv[4]),'logicalRc':n(sys.argv[5]),'ready':n(sys.argv[6]),
 'stopMs':n(sys.argv[7]),'startMs':n(sys.argv[8]),'readyMs':n(sys.argv[9]),'restartMs':n(sys.argv[10]),
 'validMin':n(sys.argv[11]),'bucketsMin':n(sys.argv[12]),'remoteHostsMin':n(sys.argv[13]),'pendingMax':n(sys.argv[14]),
 'stopFailed':n(sys.argv[15]),'startFailed':n(sys.argv[16]),'lastBadNode':n(sys.argv[17]),
 'lastAcceptanceReady':sys.argv[18] if sys.argv[18] else None,
 'lastPropagationReady':sys.argv[19] if sys.argv[19] else None,
 'lastPending':n(sys.argv[20]),'lastValid':n(sys.argv[21]),'lastBuckets':n(sys.argv[22]),'lastRemoteHosts':n(sys.argv[23]),
 'lastRefreshStatus':sys.argv[24] if sys.argv[24] else None,
 'markersComplete':sys.argv[25]=='true','stderrTail':sys.argv[26][-1500:],
}
with open(path,'a',encoding='utf-8') as h:h.write(json.dumps(value,separators=(',',':'))+'\n')
PYD200RESTART

  {
    echo "===== host=$i status=$host_status remoteRc=$remote_rc ====="
    printf '%s\n' "$out" | tail -n 80
    if [[ -n "$err" ]]; then echo '--- stderr ---'; printf '%s\n' "$err" | tail -n 80; fi
  } >>"$restart_log"

  echo "TRUYN_CLASS_D_1000 stage=restart-recovery host=$i status=${host_status} mode=parallel-node-restart stopMs=${stop_ms:-null} startMs=${start_ms:-null} readyMs=${ready_ms:-null} restartMs=${restart_ms:-null} ready=${ready:-0}/${restarted_nodes_per_host} pendingMax=${ready_max_pending:-null} validMin=${ready_min_valid:-null} bucketsMin=${ready_min_buckets:-null} remoteHostsMin=${ready_min_hosts:-null}"
done

python3 - "$restart_jsonl" "$restart_json" "$restarted_nodes_per_host" "$restart_first_node" "$restart_last_node" <<'PYD200RESTARTSUMMARY'
import json,sys
rows=[]
with open(sys.argv[1],encoding='utf-8') as h:
    for line in h:
        line=line.strip()
        if line: rows.append(json.loads(line))
value={'schema':'truyn.d200.restart-recovery-hosts.v1','hosts':rows,'passHosts':sum(r['status']=='PASS' for r in rows),'totalHosts':len(rows),'allHostsPass':all(r['status']=='PASS' for r in rows),'expectedReadyPerHost':int(sys.argv[3]),'restartNodeRange':[int(sys.argv[4]),int(sys.argv[5])]}
with open(sys.argv[2],'w',encoding='utf-8') as h:json.dump(value,h,separators=(',',':'));h.write('\n')
PYD200RESTARTSUMMARY
rm -f "$restart_jsonl"
rm -rf "$restart_dir"

d200_p95_or_null() {
  if [[ "$#" -eq 0 ]]; then printf 'null\n'; return; fi
  printf '%s\n' "$@" | python3 -c 'import sys; a=sorted(float(x) for x in sys.stdin if x.strip()); print(a[min(len(a)-1,int((len(a)-1)*.95))] if a else "null")'
}
stop_p95="$(d200_p95_or_null "${stop_values[@]}")"
start_p95="$(d200_p95_or_null "${start_values[@]}")"
ready_p95="$(d200_p95_or_null "${ready_values[@]}")"
recovery_p95="$(d200_p95_or_null "${recovery_values[@]}")"

if [[ "$recovery_p95" == null ]] || ! python3 - "$recovery_p95" <<'PYD200P95'
import sys
raise SystemExit(0 if float(sys.argv[1]) <= 120000 else 1)
PYD200P95
then
  restart_stage_failed=1
fi

if [[ "$restart_stage_failed" == 0 && "$restart_hosts_pass" == "$HOST_COUNT" ]]; then
  echo "TRUYN_CLASS_D_1000 stage=restart-recovery restarted=${restarted_total} mode=parallel-node-restart networkReady=true hosts=${restart_hosts_pass}/${restart_hosts_total} stopP95Ms=${stop_p95} startP95Ms=${start_p95} readyP95Ms=${ready_p95} recoveryP95Ms=${recovery_p95} status=PASS"
else
  echo "TRUYN_CLASS_D_1000 stage=restart-recovery restarted=${restarted_total} mode=parallel-node-restart networkReady=false hosts=${restart_hosts_pass}/${restart_hosts_total} stopP95Ms=${stop_p95} startP95Ms=${start_p95} readyP95Ms=${ready_p95} recoveryP95Ms=${recovery_p95} status=RED" >&2
  false
fi
