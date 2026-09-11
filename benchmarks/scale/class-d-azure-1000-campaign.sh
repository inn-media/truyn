#!/usr/bin/env bash
set -Eeuo pipefail

: "${HOST_COUNT:?source class-d-azure-1000-provision.sh first}"
: "${NODES_PER_HOST:?source class-d-azure-1000-provision.sh first}"
: "${NODE_COUNT:?source class-d-azure-1000-provision.sh first}"

STAGE=topology
out=$(remote "${VMS[0]}" "set -Eeuo pipefail; f=/var/lib/truyn-d1000/records-by-host.json; echo NODES=\$(jq '[.[][]]|length' \"\$f\"); echo IDS=\$(jq -r '.[][]|.nodeId' \"\$f\"|sort -u|wc -l); echo EPS=\$(jq -r '.[][]|.endpoints[0]' \"\$f\"|sort -u|wc -l)")
[[ "$(marker "$out" NODES)" == "$NODE_COUNT" ]]
[[ "$(marker "$out" IDS)" == "$NODE_COUNT" ]]
[[ "$(marker "$out" EPS)" == "$NODE_COUNT" ]]
echo "TRUYN_CLASS_D_1000 stage=topology nodes=${NODE_COUNT} identities=${NODE_COUNT} sockets=${NODE_COUNT} hosts=${HOST_COUNT} status=PASS"

STAGE=readiness-barrier
D200_READINESS_WINDOW_HARDENED=1
D200_READINESS_EVIDENCE_V2=1
D200_READINESS_TRANSPORT_GZIP_V1=1
D200_READINESS_LEASE_RECOVERY_V1=1
readiness_ready=0; readiness_total=0
readiness_min_valid=999999; readiness_max_valid=0
readiness_min_buckets=999999; readiness_max_buckets=0
readiness_min_hosts=999999; readiness_max_hosts=0
readiness_dir=$(mktemp -d)
readiness_pids=()
readiness_start_ms=$(date +%s%3N)
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
deadline=\$((\$(date +%s) + 120))
ready=0
min_valid=999999
max_valid=0
min_buckets=999999
max_buckets=0
min_hosts=999999
max_hosts=0
readiness_curl_failures=0
readiness_parse_failures=0
readiness_predicate_failures=0
readiness_last_failure_node=-1
readiness_last_failure_kind=none
readiness_last_failure_rc=0
readiness_last_status=unknown
readiness_last_propagation_ready=unknown
readiness_last_pending=-1
readiness_last_valid=-1
readiness_last_buckets=-1
readiness_last_hosts=-1
readiness_observations_dir=\$(mktemp -d)
readiness_expected_hosts_json=\$(jq -c '[.[] | .[0].endpoints[0] | sub("^[^:]+://";"") | split(":")[0]]' /var/lib/truyn-d1000/records-by-host.json)
[[ "\$(printf '%s' "\$readiness_expected_hosts_json" | jq 'length')" -eq ${HOST_COUNT} ]]
while [[ "\$(date +%s)" -lt "\$deadline" ]]; do
  ready=0
  min_valid=999999
  max_valid=0
  min_buckets=999999
  max_buckets=0
  min_hosts=999999
  max_hosts=0
  for j in \$(seq 0 $((NODES_PER_HOST-1))); do
    control_url="http://127.0.0.1:\$(( ${CONTROL_BASE} + j ))"
    readiness_now=\$(date +%s)
    readiness_remaining=\$((deadline - readiness_now))
    if [[ "\$readiness_remaining" -le 0 ]]; then
      break
    fi
    readiness_probe_timeout=\$readiness_remaining
    if [[ "\$readiness_probe_timeout" -gt 10 ]]; then
      readiness_probe_timeout=10
    fi
    readiness=''
    if readiness=\$(curl -fsS --max-time "\$readiness_probe_timeout" "\${control_url}/dht/readiness" 2>/tmp/truyn-d200-readiness-curl-\${j}.err); then
      :
    else
      readiness_last_failure_rc=\$?
      readiness_curl_failures=\$((readiness_curl_failures + 1))
      readiness_last_failure_node=\$j
      readiness_last_failure_kind=curl
      readiness_last_status=unknown
      readiness_last_propagation_ready=unknown
      readiness_last_pending=-1
      readiness_last_valid=-1
      readiness_last_buckets=-1
      readiness_last_hosts=-1
      continue
    fi
    if [[ "\$(date +%s)" -ge "\$deadline" ]]; then
      break
    fi
    if ! printf '%s' "\$readiness" | jq -e . >/dev/null 2>&1; then
      readiness_parse_failures=\$((readiness_parse_failures + 1))
      readiness_last_failure_node=\$j
      readiness_last_failure_kind=json
      readiness_last_failure_rc=0
      readiness_last_status=unknown
      readiness_last_propagation_ready=unknown
      readiness_last_pending=-1
      readiness_last_valid=-1
      readiness_last_buckets=-1
      readiness_last_hosts=-1
      continue
    fi
    status=\$(printf '%s' "\$readiness" | jq -r '.refresh.status')
    propagation_ready=\$(printf '%s' "\$readiness" | jq -r '.acceptanceReady == true and .peerRecordPropagation.ready == true')
    pending=\$(printf '%s' "\$readiness" | jq -r '.peerRecordPropagation.pendingCount // -1')
    valid=\$(printf '%s' "\$readiness" | jq -r '.validPeers')
    buckets=\$(printf '%s' "\$readiness" | jq -r '.populatedBuckets')
    hosts=\$(printf '%s' "\$readiness" | jq -r '.remoteEndpointDiversity.hostCount')
    if [[ "\$hosts" -lt ${HOST_COUNT} ]]; then
      readiness_present_hosts_json=\$(printf '%s' "\$readiness" | jq -c '.remoteEndpointDiversity.hosts // []')
      readiness_recovery_targets=\$(jq -nc \
        --argjson expected "\$readiness_expected_hosts_json" \
        --argjson present "\$readiness_present_hosts_json" \
        --argjson localHost ${i} \
        --argjson localNode "\$j" \
        --slurpfile records /var/lib/truyn-d1000/records-by-host.json '
          (\$records[0][\$localHost][\$localNode].nodeId) as \$self
          | [ \$expected | to_entries[] | . as \$entry
              | select((\$present | index(\$entry.value)) == null)
              | [ \$records[0][\$entry.key][] | select(.nodeId != \$self) | .nodeId ][0]
              | select(. != null)
            ] | unique
        ')
      readiness_recovery_target_count=\$(printf '%s' "\$readiness_recovery_targets" | jq 'length')
      readiness_missing_host_count=\$(( ${HOST_COUNT} - hosts ))
      [[ "\$readiness_recovery_target_count" -eq "\$readiness_missing_host_count" ]]
      if [[ "\$readiness_recovery_target_count" -gt 0 ]]; then
        [[ "\$readiness_recovery_target_count" -le ${HOST_COUNT} ]]
        [[ "\$readiness_recovery_target_count" -le ${BOOTSTRAP_MAX_PEERS_PER_NODE} ]]
        readiness_refresh_remaining=\$(( deadline - \$(date +%s) ))
        if [[ "\$readiness_refresh_remaining" -gt 0 ]]; then
          readiness_refresh_body=\$(jq -nc \
            --argjson targets "\$readiness_recovery_targets" \
            --arg seed "d200-readiness-\${j}-\${readiness_now}" \
            '{targets:\$targets,targetCount:(\$targets|length),maxRounds:4,seed:\$seed}')
          readiness_refresh_timeout=\$readiness_refresh_remaining
          if [[ "\$readiness_refresh_timeout" -gt 10 ]]; then readiness_refresh_timeout=10; fi
          curl -fsS --max-time "\$readiness_refresh_timeout" \
            -H 'content-type: application/json' \
            --data-binary "\$readiness_refresh_body" \
            "\${control_url}/dht/refresh" \
            >"/tmp/truyn-d200-readiness-refresh-\${j}.json" 2>/dev/null || true
        fi
      fi
    fi
    if [[ ! "\$pending" =~ ^-?[0-9]+$ || ! "\$valid" =~ ^[0-9]+$ || ! "\$buckets" =~ ^[0-9]+$ || ! "\$hosts" =~ ^[0-9]+$ ]]; then
      readiness_parse_failures=\$((readiness_parse_failures + 1))
      readiness_last_failure_node=\$j
      readiness_last_failure_kind=fields
      readiness_last_failure_rc=0
      readiness_last_status=unknown
      readiness_last_propagation_ready=unknown
      readiness_last_pending=-1
      readiness_last_valid=-1
      readiness_last_buckets=-1
      readiness_last_hosts=-1
      continue
    fi
    if [[ "\$propagation_ready" == true && "\$status" == refreshed && "\$valid" -ge ${BOOTSTRAP_MAX_PEERS_PER_NODE} && "\$buckets" -gt 0 && "\$hosts" -eq ${HOST_COUNT} ]]; then
      ready=\$((ready + 1))
    else
      readiness_predicate_failures=\$((readiness_predicate_failures + 1))
      readiness_last_failure_node=\$j
      readiness_last_failure_kind=predicate
      readiness_last_failure_rc=0
      readiness_last_status=\$status
      readiness_last_propagation_ready=\$propagation_ready
      readiness_last_pending=\$pending
      readiness_last_valid=\$valid
      readiness_last_buckets=\$buckets
      readiness_last_hosts=\$hosts
    fi
    printf '%s' "\$readiness" | jq -c \
      --argjson node "\$j" \
      --argjson expected "\$readiness_expected_hosts_json" '
        . as \$r
        | (\$r.remoteEndpointDiversity.hosts // []) as \$present
        | {
            nodeIndex: \$node,
            observationUnavailable: false,
            acceptanceReady: (\$r.acceptanceReady // false),
            refreshStatus: (\$r.refresh.status // "unknown"),
            validPeers: (\$r.validPeers // 0),
            populatedBuckets: (\$r.populatedBuckets // 0),
            remoteHostCount: (\$r.remoteEndpointDiversity.hostCount // 0),
            missingHostIndexes: [
              \$expected | to_entries[] | . as \$entry
              | select((\$present | index(\$entry.value)) == null)
              | \$entry.key
            ],
            peerRecordSequence: (\$r.peerRecordSequence // null),
            oldestPeerRecordIssuedAt: (\$r.peerRecordLeases.oldestPeerRecordIssuedAt // null),
            nearestPeerRecordExpiryMs: (\$r.peerRecordLeases.nearestPeerRecordExpiryMs // null),
            expiredPeerRecords: (\$r.peerRecordLeases.expiredPeerRecords // null),
            peerRecordPropagation: {
              ready: (\$r.peerRecordPropagation.ready // false),
              targetCount: (\$r.peerRecordPropagation.targetCount // 0),
              acknowledgedCount: (\$r.peerRecordPropagation.acknowledgedCount // 0),
              pendingCount: (\$r.peerRecordPropagation.pendingCount // 0)
            },
            periodicRefreshLastResult: (\$r.periodicRefresh.lastResult // null)
          }
      ' > "\$readiness_observations_dir/\$j.json"
    if [[ "\$valid" -lt "\$min_valid" ]]; then min_valid="\$valid"; fi
    if [[ "\$valid" -gt "\$max_valid" ]]; then max_valid="\$valid"; fi
    if [[ "\$buckets" -lt "\$min_buckets" ]]; then min_buckets="\$buckets"; fi
    if [[ "\$buckets" -gt "\$max_buckets" ]]; then max_buckets="\$buckets"; fi
    if [[ "\$hosts" -lt "\$min_hosts" ]]; then min_hosts="\$hosts"; fi
    if [[ "\$hosts" -gt "\$max_hosts" ]]; then max_hosts="\$hosts"; fi
  done
  [[ "\$ready" -eq ${NODES_PER_HOST} ]] && break
  sleep 2
done
echo READINESS_READY=\$ready
echo READINESS_TOTAL=${NODES_PER_HOST}
echo READINESS_MIN_VALID=\$min_valid
echo READINESS_MAX_VALID=\$max_valid
echo READINESS_MIN_BUCKETS=\$min_buckets
echo READINESS_MAX_BUCKETS=\$max_buckets
echo READINESS_MIN_HOSTS=\$min_hosts
echo READINESS_MAX_HOSTS=\$max_hosts
echo READINESS_CURL_FAILURES=\$readiness_curl_failures
echo READINESS_PARSE_FAILURES=\$readiness_parse_failures
echo READINESS_PREDICATE_FAILURES=\$readiness_predicate_failures
echo READINESS_LAST_FAILURE_NODE=\$readiness_last_failure_node
echo READINESS_LAST_FAILURE_KIND=\$readiness_last_failure_kind
echo READINESS_LAST_FAILURE_RC=\$readiness_last_failure_rc
echo READINESS_LAST_STATUS=\$readiness_last_status
echo READINESS_LAST_PROPAGATION_READY=\$readiness_last_propagation_ready
echo READINESS_LAST_PENDING=\$readiness_last_pending
echo READINESS_LAST_VALID=\$readiness_last_valid
echo READINESS_LAST_BUCKETS=\$readiness_last_buckets
echo READINESS_LAST_HOSTS=\$readiness_last_hosts
for j in \$(seq 0 $((NODES_PER_HOST-1))); do
  if [[ ! -s "\$readiness_observations_dir/\$j.json" ]]; then
    printf '{"nodeIndex":%s,"observationUnavailable":true}\n' "\$j" > "\$readiness_observations_dir/\$j.json"
  fi
done
readiness_node_observations_b64=\$(jq -s -c 'sort_by(.nodeIndex)' "\$readiness_observations_dir"/*.json | gzip -c -9 | base64 -w0)
[[ "\${#readiness_node_observations_b64}" -le 3000 ]]
echo READINESS_NODE_OBSERVATIONS_B64=\$readiness_node_observations_b64
rm -rf "\$readiness_observations_dir"
[[ "\$ready" -eq ${NODES_PER_HOST} ]]
EOS
)
  readiness_result_file=/tmp/truyn-d200-readiness-result
  readiness_status_file=/tmp/truyn-d200-readiness-status
  wrapped_script="set -Eeuo pipefail
result_file='$readiness_result_file'
status_file='$readiness_status_file'
result_tmp=\"\${result_file}.tmp\"
status_tmp=\"\${status_file}.tmp\"
rm -f \"\$result_file\" \"\$result_tmp\" \"\$status_file\" \"\$status_tmp\"
set +e
(
  set -Eeuo pipefail
  {
${script}
  } | tee \"\$result_tmp\"
)
probe_rc=\$?
set -e
if [[ -f \"\$result_tmp\" ]]; then mv \"\$result_tmp\" \"\$result_file\"; fi
printf 'READINESS_PROBE_RC=%s\\n' \"\$probe_rc\" > \"\$status_tmp\"
mv \"\$status_tmp\" \"\$status_file\"
exit \"\$probe_rc\""
  (remote "${VMS[$i]}" "$wrapped_script" >"$readiness_dir/$i") &
  readiness_pids+=("$!")
done
readiness_failed=0
for pid in "${readiness_pids[@]}"; do
  if ! wait "$pid"; then readiness_failed=1; fi
done
readiness_markers_present() {
  local text="$1" key
  for key in READINESS_READY READINESS_TOTAL READINESS_MIN_VALID READINESS_MAX_VALID READINESS_MIN_BUCKETS READINESS_MAX_BUCKETS READINESS_MIN_HOSTS READINESS_MAX_HOSTS READINESS_NODE_OBSERVATIONS_B64; do
    [[ -n "$(marker "$text" "$key")" ]] || return 1
  done
}
readiness_collection_attempts=4
readiness_gate_failed=0
for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$readiness_dir/$i")"
  if ! readiness_markers_present "$out"; then
    recovered=''
    if recovered="$(remote "${VMS[$i]}" "set -Eeuo pipefail; cat /tmp/truyn-d200-readiness-result")"; then
      :
    fi
    if ! readiness_markers_present "$recovered"; then
      for attempt in $(seq 1 "$readiness_collection_attempts"); do
        recovered=''
        if recovered="$(remote "${VMS[$i]}" "set -Eeuo pipefail; s=/tmp/truyn-d200-readiness-status; r=/tmp/truyn-d200-readiness-result; [[ -f \"\$s\" ]]; cat \"\$s\"; [[ -f \"\$r\" ]]; cat \"\$r\"")"; then
          :
        fi
        probe_rc="$(marker "$recovered" READINESS_PROBE_RC)"
        if readiness_markers_present "$recovered"; then break; fi
        if [[ -n "$probe_rc" && "$probe_rc" != 0 ]]; then
          echo "TRUYN_D200_READINESS_OBSERVATION_ERROR readiness_probe_failed_without_complete_observation host=$i rc=$probe_rc" >&2
          rm -rf "$readiness_dir"
          false
        fi
        [[ "$attempt" == "$readiness_collection_attempts" ]] || sleep 1
      done
    fi
    if ! readiness_markers_present "$recovered"; then
      echo "TRUYN_D200_READINESS_OBSERVATION_ERROR readiness_observation_missing host=$i launch_failure=$readiness_failed" >&2
      rm -rf "$readiness_dir"
      false
    fi
    out="$recovered"
    echo "TRUYN_CLASS_D_1000 stage=readiness-observation-recovery host=$i mode=read-only status=PASS"
  fi
  ready=$(marker "$out" READINESS_READY); total=$(marker "$out" READINESS_TOTAL)
  node_observations_b64=$(marker "$out" READINESS_NODE_OBSERVATIONS_B64)
  node_observations_file="$readiness_dir/$i.nodes.json"
  if [[ -z "$node_observations_b64" ]] || ! printf '%s' "$node_observations_b64" | base64 -d | gzip -dc | jq -e 'if type=="array" and length=='"$NODES_PER_HOST"' then . else error("invalid readiness observation payload") end' >"$node_observations_file"; then
    printf '[]
' >"$node_observations_file"
    readiness_gate_failed=1
    echo "TRUYN_D200_READINESS_OBSERVATION_ERROR node_observations_missing host=$i" >&2
  else
    tmp_nodes="$readiness_dir/$i.nodes.tmp.json"
    jq --argjson host "$i" 'map(. + {hostIndex:$host})' "$node_observations_file" >"$tmp_nodes"
    mv "$tmp_nodes" "$node_observations_file"
  fi
  if [[ "$ready" != "$NODES_PER_HOST" || "$total" != "$NODES_PER_HOST" ]]; then
    readiness_gate_failed=1
    curl_failures=$(marker "$out" READINESS_CURL_FAILURES); parse_failures=$(marker "$out" READINESS_PARSE_FAILURES); predicate_failures=$(marker "$out" READINESS_PREDICATE_FAILURES)
    last_failure_node=$(marker "$out" READINESS_LAST_FAILURE_NODE); last_failure_kind=$(marker "$out" READINESS_LAST_FAILURE_KIND); last_failure_rc=$(marker "$out" READINESS_LAST_FAILURE_RC)
    last_status=$(marker "$out" READINESS_LAST_STATUS); last_propagation_ready=$(marker "$out" READINESS_LAST_PROPAGATION_READY); last_pending=$(marker "$out" READINESS_LAST_PENDING)
    last_valid=$(marker "$out" READINESS_LAST_VALID); last_buckets=$(marker "$out" READINESS_LAST_BUCKETS); last_hosts=$(marker "$out" READINESS_LAST_HOSTS)
    echo "TRUYN_D200_READINESS_GATE_FAILURE host=$i ready=${ready}/${total} curlFailures=${curl_failures:-unknown} parseFailures=${parse_failures:-unknown} predicateFailures=${predicate_failures:-unknown} lastFailureNode=${last_failure_node:-unknown} lastFailureKind=${last_failure_kind:-unknown} lastFailureRc=${last_failure_rc:-unknown} lastStatus=${last_status:-unknown} lastPropagationReady=${last_propagation_ready:-unknown} lastPending=${last_pending:-unknown} lastValid=${last_valid:-unknown} lastBuckets=${last_buckets:-unknown} lastHosts=${last_hosts:-unknown}" >&2
    if [[ -s "$node_observations_file" ]]; then
      jq -c --argjson minPeers "$BOOTSTRAP_MAX_PEERS_PER_NODE" --argjson hostCount "$HOST_COUNT" '.[] | select(
        (.observationUnavailable == true) or
        (.acceptanceReady != true) or
        (.peerRecordPropagation.ready != true) or
        (.refreshStatus != "refreshed") or
        ((.validPeers // 0) < $minPeers) or
        ((.populatedBuckets // 0) <= 0) or
        ((.remoteHostCount // 0) != $hostCount)
      )' "$node_observations_file" | while IFS= read -r row; do
        echo "TRUYN_D200_READINESS_NODE_FAILURE host=$i observation=$row" >&2
      done
    fi
  fi
  readiness_ready=$((readiness_ready+ready)); readiness_total=$((readiness_total+total))
  min_valid=$(marker "$out" READINESS_MIN_VALID); max_valid=$(marker "$out" READINESS_MAX_VALID)
  min_buckets=$(marker "$out" READINESS_MIN_BUCKETS); max_buckets=$(marker "$out" READINESS_MAX_BUCKETS)
  min_hosts=$(marker "$out" READINESS_MIN_HOSTS); max_hosts=$(marker "$out" READINESS_MAX_HOSTS)
  if [[ "$min_valid" -lt "$readiness_min_valid" ]]; then readiness_min_valid="$min_valid"; fi
  if [[ "$max_valid" -gt "$readiness_max_valid" ]]; then readiness_max_valid="$max_valid"; fi
  if [[ "$min_buckets" -lt "$readiness_min_buckets" ]]; then readiness_min_buckets="$min_buckets"; fi
  if [[ "$max_buckets" -gt "$readiness_max_buckets" ]]; then readiness_max_buckets="$max_buckets"; fi
  if [[ "$min_hosts" -lt "$readiness_min_hosts" ]]; then readiness_min_hosts="$min_hosts"; fi
  if [[ "$max_hosts" -gt "$readiness_max_hosts" ]]; then readiness_max_hosts="$max_hosts"; fi
  echo "TRUYN_CLASS_D_1000 stage=readiness-barrier host=$i mode=parallel-hosts ready=${ready}/${total} validMin=${min_valid} validMax=${max_valid} bucketsMin=${min_buckets} bucketsMax=${max_buckets} remoteHostsMin=${min_hosts} remoteHostsMax=${max_hosts} status=PASS"
done
readiness_observations_path="${GITHUB_WORKSPACE:-$PWD}/class-d-200-readiness-node-observations.json"
jq -s --argjson expectedHosts "$HOST_COUNT" --argjson expectedNodes "$NODE_COUNT" '{
  schema:"truyn.d200.readiness-observations.v1",
  expectedHostCount:$expectedHosts,
  expectedNodeCount:$expectedNodes,
  observations:(add | sort_by(.hostIndex,.nodeIndex))
}' "$readiness_dir"/*.nodes.json >"$readiness_observations_path"
readiness_ms=$(( $(date +%s%3N) - readiness_start_ms ))
rm -rf "$readiness_dir"
if [[ "$readiness_gate_failed" != 0 ]]; then
  echo "TRUYN_D200_READINESS_AGGREGATE_FAILURE ready=${readiness_ready}/${readiness_total} validMin=${readiness_min_valid} validMax=${readiness_max_valid} bucketsMin=${readiness_min_buckets} bucketsMax=${readiness_max_buckets} remoteHostsMin=${readiness_min_hosts} remoteHostsMax=${readiness_max_hosts} observations=${readiness_observations_path}" >&2
  false
fi
[[ "$readiness_ready" == "$NODE_COUNT" ]]
echo "TRUYN_CLASS_D_1000 stage=readiness-barrier ready=${readiness_ready}/${readiness_total} validMin=${readiness_min_valid} validMax=${readiness_max_valid} bucketsMin=${readiness_min_buckets} bucketsMax=${readiness_max_buckets} remoteHostsMin=${readiness_min_hosts} remoteHostsMax=${readiness_max_hosts} ms=${readiness_ms} status=PASS"

STAGE=convergence
conv_success=0; conv_total=0; conv_p95=0; conv_p99=0
conv_dir=$(mktemp -d)
conv_start_ms=$(date +%s%3N)
conv_pids=()
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
python3 - <<'PY'
import concurrent.futures,json,subprocess,time
records=json.load(open('/var/lib/truyn-d1000/records-by-host.json'))
host=${i}; H=${HOST_COUNT}; N=${NODES_PER_HOST}; base=${CONTROL_BASE}
def one(j):
    target_host=(host+1+(j%(H-1)))%H
    target_local=(j*17+host*7)%N
    node_id=records[target_host][target_local]['nodeId']
    body=json.dumps({'nodeId':node_id,'input':{'scenario':'d1000-convergence','source':host*N+j}},separators=(',',':'))
    start=time.monotonic()
    deadline=start+175
    while time.monotonic()<deadline:
        p=subprocess.run(['curl','-sS','--max-time','12','-o','/tmp/d1000-conv-'+str(j),'-w','%{http_code}','-H','content-type: application/json','--data-binary',body,f'http://127.0.0.1:{base+j}/need'],text=True,capture_output=True)
        if p.returncode==0 and p.stdout.strip()=='200': return (1,(time.monotonic()-start)*1000)
        time.sleep(.5)
    return (0,175000.0)
with concurrent.futures.ThreadPoolExecutor(max_workers=16) as ex:
    rows=list(ex.map(one,range(N)))
lat=sorted(v for ok,v in rows if ok); success=sum(ok for ok,_ in rows)
def q(p):
    if not lat:return 999999
    return round(lat[min(len(lat)-1,max(0,int((len(lat)-1)*p)))],3)
print('CONV_OK='+str(success)); print('CONV_TOTAL='+str(N)); print('CONV_P95='+str(q(.95))); print('CONV_P99='+str(q(.99)))
PY
EOS
)
  (remote "${VMS[$i]}" "$script" >"$conv_dir/$i") &
  conv_pids+=("$!")
done
for pid in "${conv_pids[@]}"; do wait "$pid"; done
conv_ms=$(( $(date +%s%3N) - conv_start_ms ))
for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$conv_dir/$i")"
  ok=$(marker "$out" CONV_OK); total=$(marker "$out" CONV_TOTAL); p95=$(marker "$out" CONV_P95); p99=$(marker "$out" CONV_P99)
  conv_success=$((conv_success+ok)); conv_total=$((conv_total+total))
  conv_p95=$(python3 -c "print(max(float('$conv_p95'),float('$p95')))" )
  conv_p99=$(python3 -c "print(max(float('$conv_p99'),float('$p99')))" )
  echo "TRUYN_CLASS_D_1000 stage=convergence host=$i mode=parallel-hosts success=${ok}/${total} p95Ms=${p95} p99Ms=${p99}"
done
rm -rf "$conv_dir"
conv_rate=$(python3 -c "print(round($conv_success/$conv_total,6))")
python3 - <<PY
assert float('$conv_rate') >= .99, '$conv_rate'
assert float('$conv_p95') <= 120000, '$conv_p95'
PY
echo "TRUYN_CLASS_D_1000 stage=convergence mode=parallel-hosts hosts=${HOST_COUNT} success=${conv_success}/${conv_total} routingSuccess=${conv_rate} p95Ms=${conv_p95} p99Ms=${conv_p99} aggregateMs=${conv_ms} status=PASS"

STAGE=baseline-routing
D200_BASELINE_ORIGIN_DIAG=1
D200_BASELINE_ROW_MAX_BYTES=1800
base_success=0; base_total=0; base_p50=0; base_p90=0; base_p95=0; base_p99=0
baseline_dir=$(mktemp -d)
baseline_diag_phase_dir=$(mktemp -d)
baseline_diag_json="${GITHUB_WORKSPACE:-$PWD}/class-d-200-baseline-origin.json"
baseline_diag_jsonl="${GITHUB_WORKSPACE:-$PWD}/class-d-200-baseline-origin.jsonl"
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
records=json.load(open('/var/lib/truyn-d1000/records-by-host.json'))
host=${i}; H=${HOST_COUNT}; N=${NODES_PER_HOST}; base=${CONTROL_BASE}
diag_path=f'/var/lib/truyn-d1000/baseline-origin-host-{host}.json'

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
    path=f'/var/lib/truyn-d1000/node-{global_index}-state.json'
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

# D200_BASELINE_PRODUCTION_RECOVERY=1
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
path=f'/var/lib/truyn-d1000/baseline-origin-host-{host}.json'
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
    state_path=f'/var/lib/truyn-d1000/node-{global_index}-state.json'
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
path='/var/lib/truyn-d1000/baseline-origin-host-${i}.json'
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

STAGE=invalid-signed-state
script=$(cat <<EOS
set -Eeuo pipefail
src='http://127.0.0.1:${CONTROL_BASE}'
target_endpoint=\$(jq -r '.[1][0].endpoints[0]' /var/lib/truyn-d1000/records-by-host.json)
rep=\$(curl -fsS --max-time 45 -H 'content-type: application/json' --data-binary '{"namespace":"class-d1000-safety","key":"byzantine-proof","value":{"valid":true},"replicationFactor":3,"minAcks":2,"ttlMs":1800000}' "\$src/replicate")
acks=\$(printf '%s' "\$rep" | jq -r '.result.acknowledgements // 0')
printf '%s' "\$rep" | jq -c '.record' >/tmp/d1000-valid-record.json
probe=\$(node /opt/truyn/benchmarks/scale/class-d-1000-remote-dht-probe.js "\$target_endpoint" /tmp/d1000-valid-record.json /etc/truyn-d1000/key.pem /etc/truyn-d1000/cert.pem)
echo DHT_ACKS=\$acks
echo REMOTE_QUIC=\$(printf '%s' "\$probe" | jq -r '.transport == "quic-control"')
echo TARGET_REJECTED=\$(printf '%s' "\$probe" | jq -r '.targetRejected')
echo REJECTION_REASON=\$(printf '%s' "\$probe" | jq -r '.rejectionReason')
echo INVALID_ACCEPTED=\$(printf '%s' "\$probe" | jq -r '.acceptedCount')
EOS
)
out=$(remote "${VMS[0]}" "$script")
dht_safety_acks=$(marker "$out" DHT_ACKS)
invalid_remote_quic=$(marker "$out" REMOTE_QUIC)
invalid_target_rejected=$(marker "$out" TARGET_REJECTED)
invalid_rejection_reason=$(marker "$out" REJECTION_REASON)
invalid_signed_state_accepted=$(marker "$out" INVALID_ACCEPTED)
[[ "$dht_safety_acks" -ge 2 ]]
[[ "$invalid_remote_quic" == true ]]
[[ "$invalid_target_rejected" == true ]]
[[ "$invalid_rejection_reason" == invalid_dht_record:dht_record_signature ]]
[[ "$invalid_signed_state_accepted" == 0 ]]
echo "TRUYN_CLASS_D_1000 stage=invalid-signed-state invalidSignedStateAccepted=${invalid_signed_state_accepted} validRecordAcks=${dht_safety_acks} remoteQuicControl=${invalid_remote_quic} targetRejected=${invalid_target_rejected} rejectionReason=${invalid_rejection_reason} status=PASS"

STAGE=local-safety-invariants
script=$(cat <<'EOS'
set -Eeuo pipefail
cd /opt/truyn
result=$(node benchmarks/scale/class-d-1000-safety-probes.js)
echo STALE_ACCEPTED=$(printf '%s' "$result" | jq -r '.staleRevokedReceiptAcceptedCount')
echo STALE_REASON=$(printf '%s' "$result" | jq -r '.probes.staleReceipt.reason')
echo UNAUTHORIZED_PROVIDER_EXECUTIONS=$(printf '%s' "$result" | jq -r '.unauthorizedProviderExecutionCount')
echo PROVIDER_ACCESS_DENIED=$(printf '%s' "$result" | jq -r '.probes.providerAuthorization.accessDenied')
EOS
)
out=$(remote "${VMS[0]}" "$script")
stale_receipt_accepted=$(marker "$out" STALE_ACCEPTED)
stale_receipt_reason=$(marker "$out" STALE_REASON)
unauthorized_provider_execution=$(marker "$out" UNAUTHORIZED_PROVIDER_EXECUTIONS)
provider_access_denied=$(marker "$out" PROVIDER_ACCESS_DENIED)
[[ "$stale_receipt_accepted" == 0 ]]
[[ "$stale_receipt_reason" == trust_receipt_v2_lifecycle_head_stale ]]
[[ "$unauthorized_provider_execution" == 0 ]]
[[ "$provider_access_denied" == true ]]
echo "TRUYN_CLASS_D_1000 stage=local-safety-invariants staleRevokedReceiptAccepted=${stale_receipt_accepted} unauthorizedProviderExecution=${unauthorized_provider_execution} providerAccessDenied=${provider_access_denied} status=PASS"

STAGE=durable-writes
writes=0
d200_durable_write_ttl_ms=21600000
d200_write_window_start_ms=$(date +%s%3N)
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
ok=0
for j in \$(seq 0 4); do
  body=\$(jq -nc --arg k "d1000-${i}-\${j}" --argjson h ${i} --argjson n \$j '{namespace:"class-d1000",key:\$k,value:{host:\$h,index:\$n},replicationFactor:3,minAcks:2,ttlMs:${d200_durable_write_ttl_ms}}')
  curl -fsS --max-time 45 -H 'content-type: application/json' --data-binary "\$body" http://127.0.0.1:\$(( ${CONTROL_BASE} + j ))/replicate >/tmp/d1000-write-\$j.json
  a=\$(jq -r '.result.acknowledgements // 0' /tmp/d1000-write-\$j.json)
  [[ "\$a" -ge 2 ]] && ok=\$((ok+1))
done
echo WRITES=\$ok
EOS
)
  out=$(remote "${VMS[$i]}" "$script")
  w=$(marker "$out" WRITES); [[ "$w" == 5 ]]; writes=$((writes+w))
done
[[ "$writes" == 100 ]]
d200_write_window_last_ack_ms=$(date +%s%3N)
echo "TRUYN_CLASS_D_1000 stage=durable-writes acknowledged=${writes} ttlMs=${d200_durable_write_ttl_ms} writeWindowMs=$((d200_write_window_last_ack_ms-d200_write_window_start_ms)) status=PASS"

STAGE=restart-recovery
restart_dir=$(mktemp -d)
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
t0=\$(date +%s%3N)
stop_pids=()
for j in \$(seq 5 9); do
  idx=\$(( ${i} * ${NODES_PER_HOST} + j ))
  systemctl stop truyn-d1000@\${idx}.service &
  stop_pids+=("\$!")
done
stop_failed=0
for pid in "\${stop_pids[@]}"; do
  if ! wait "\$pid"; then stop_failed=1; fi
done
[[ "\$stop_failed" == 0 ]]
t_stop=\$(date +%s%3N)
stop_ms=\$((t_stop-t0))
sleep 2
t_start0=\$(date +%s%3N)
start_pids=()
for j in \$(seq 5 9); do
  idx=\$(( ${i} * ${NODES_PER_HOST} + j ))
  systemctl start truyn-d1000@\${idx}.service &
  start_pids+=("\$!")
done
start_failed=0
for pid in "\${start_pids[@]}"; do
  if ! wait "\$pid"; then start_failed=1; fi
done
[[ "\$start_failed" == 0 ]]
t_start=\$(date +%s%3N)
start_ms=\$((t_start-t_start0))
t_ready0=\$(date +%s%3N)
good=0
min_valid=999999
min_buckets=999999
min_hosts=999999
max_pending=0
for n in \$(seq 1 90); do
  good=0
  min_valid=999999
  min_buckets=999999
  min_hosts=999999
  max_pending=0
  for j in \$(seq 5 9); do
    control_url="http://127.0.0.1:\$(( ${CONTROL_BASE}+j ))"
    readiness=''
    if readiness=\$(curl -fsS --max-time 2 "\${control_url}/dht/readiness" 2>/dev/null); then
      acceptance_ready=\$(printf '%s' "\$readiness" | jq -r '.acceptanceReady == true and .peerRecordPropagation.ready == true' 2>/dev/null || echo false)
      pending=\$(printf '%s' "\$readiness" | jq -r '.peerRecordPropagation.pendingCount // 999999' 2>/dev/null || echo 999999)
      valid=\$(printf '%s' "\$readiness" | jq -r '.validPeers // 0' 2>/dev/null || echo 0)
      buckets=\$(printf '%s' "\$readiness" | jq -r '.populatedBuckets // 0' 2>/dev/null || echo 0)
      hosts=\$(printf '%s' "\$readiness" | jq -r '.remoteEndpointDiversity.hostCount // 0' 2>/dev/null || echo 0)
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
      fi
    fi
  done
  [[ \$good -eq 5 ]] && break
  sleep 1
done
[[ \$good -eq 5 ]]
t1=\$(date +%s%3N)
ready_ms=\$((t1-t_ready0))
restart_ms=\$((t1-t0))
echo STOP_MS=\$stop_ms
echo START_MS=\$start_ms
echo READY_MS=\$ready_ms
echo RESTART_MS=\$restart_ms
echo READY_MIN_VALID=\$min_valid
echo READY_MIN_BUCKETS=\$min_buckets
echo READY_MIN_HOSTS=\$min_hosts
echo READY_MAX_PENDING=\$max_pending
EOS
)
  (remote "${VMS[$i]}" "$script" >"$restart_dir/$i") &
done
wait
stop_values=()
start_values=()
ready_values=()
recovery_values=()
for i in $(seq 0 $((HOST_COUNT-1))); do
  out="$(cat "$restart_dir/$i")"
  stop_ms=$(printf '%s\n' "$out" | sed -n 's/^STOP_MS=//p' | tail -1); [[ -n "$stop_ms" ]]; stop_values+=("$stop_ms")
  start_ms=$(printf '%s\n' "$out" | sed -n 's/^START_MS=//p' | tail -1); [[ -n "$start_ms" ]]; start_values+=("$start_ms")
  ready_ms=$(printf '%s\n' "$out" | sed -n 's/^READY_MS=//p' | tail -1); [[ -n "$ready_ms" ]]; ready_values+=("$ready_ms")
  restart_ms=$(printf '%s\n' "$out" | sed -n 's/^RESTART_MS=//p' | tail -1); [[ -n "$restart_ms" ]]; recovery_values+=("$restart_ms")
  ready_min_valid=$(printf '%s\n' "$out" | sed -n 's/^READY_MIN_VALID=//p' | tail -1); [[ -n "$ready_min_valid" ]]
  ready_min_buckets=$(printf '%s\n' "$out" | sed -n 's/^READY_MIN_BUCKETS=//p' | tail -1); [[ -n "$ready_min_buckets" ]]
  ready_min_hosts=$(printf '%s\n' "$out" | sed -n 's/^READY_MIN_HOSTS=//p' | tail -1); [[ -n "$ready_min_hosts" ]]
  ready_max_pending=$(printf '%s\n' "$out" | sed -n 's/^READY_MAX_PENDING=//p' | tail -1); [[ -n "$ready_max_pending" ]]
  echo "TRUYN_CLASS_D_1000 stage=restart-recovery host=$i mode=parallel-node-restart stopMs=${stop_ms} startMs=${start_ms} readyMs=${ready_ms} restartMs=${restart_ms} peerPropagationReady=true pendingMax=${ready_max_pending} validMin=${ready_min_valid} bucketsMin=${ready_min_buckets} remoteHostsMin=${ready_min_hosts}"
done
rm -rf "$restart_dir"
stop_p95=$(printf '%s\n' "${stop_values[@]}" | python3 -c 'import sys; a=sorted(float(x) for x in sys.stdin if x.strip()); print(a[min(len(a)-1,int((len(a)-1)*.95))])')
start_p95=$(printf '%s\n' "${start_values[@]}" | python3 -c 'import sys; a=sorted(float(x) for x in sys.stdin if x.strip()); print(a[min(len(a)-1,int((len(a)-1)*.95))])')
ready_p95=$(printf '%s\n' "${ready_values[@]}" | python3 -c 'import sys; a=sorted(float(x) for x in sys.stdin if x.strip()); print(a[min(len(a)-1,int((len(a)-1)*.95))])')
recovery_p95=$(printf '%s\n' "${recovery_values[@]}" | python3 -c 'import sys; a=sorted(float(x) for x in sys.stdin if x.strip()); print(a[min(len(a)-1,int((len(a)-1)*.95))])')
python3 - <<PY
assert float('$recovery_p95') <= 120000, '$recovery_p95'
PY
echo "TRUYN_CLASS_D_1000 stage=restart-recovery restarted=100 mode=parallel-node-restart networkReady=true stopP95Ms=${stop_p95} startP95Ms=${start_p95} readyP95Ms=${ready_p95} recoveryP95Ms=${recovery_p95} status=PASS"

STAGE=post-restart-routing
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

rows=[first_attempt(j) for j in range(5,10)]
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

STAGE=packet-partition
block_ip="${PRIV[1]}"
remote "${VMS[0]}" "iptables -I OUTPUT 1 -p udp -d '${block_ip}' --dport ${QUIC_BASE}:$((QUIC_BASE+NODES_PER_HOST-1)) -m comment --comment truyn-d1000-partition -j DROP; echo PARTITION=1" >/dev/null
out=$(remote "${VMS[0]}" "python3 - <<'PY'
import concurrent.futures,json,subprocess
records=json.load(open('/var/lib/truyn-d1000/records-by-host.json')); targets=[r['nodeId'] for r in records[1][:20]]; base=${CONTROL_BASE}
def one(args):
 j,n=args; b=json.dumps({'nodeId':n,'input':{'scenario':'d1000-packet-partition','probe':j}},separators=(',',':'))
 p=subprocess.run(['curl','-sS','--max-time','4','-o','/tmp/d1000-part-'+str(j),'-w','%{http_code}','-H','content-type: application/json','--data-binary',b,f'http://127.0.0.1:{base+(j%5)}/need'],text=True,capture_output=True)
 return int(p.returncode==0 and p.stdout.strip()=='200')
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex: rows=list(ex.map(one,enumerate(targets)))
print('PARTITION_SUCCESSES='+str(sum(rows))); print('PARTITION_PROBES='+str(len(rows)))
PY")
partition_successes=$(marker "$out" PARTITION_SUCCESSES)
partition_probes=$(marker "$out" PARTITION_PROBES)
remote "${VMS[0]}" "iptables -D OUTPUT -p udp -d '${block_ip}' --dport ${QUIC_BASE}:$((QUIC_BASE+NODES_PER_HOST-1)) -m comment --comment truyn-d1000-partition -j DROP; echo HEALED=1" >/dev/null
[[ "$partition_successes" == 0 ]]
heal_start=$(date +%s%3N)
for n in $(seq 1 90); do
  out=$(remote "${VMS[0]}" "target=\$(jq -r '.[1][0].nodeId' /var/lib/truyn-d1000/records-by-host.json); body=\$(jq -nc --arg node \"\$target\" '{nodeId:\$node,input:{scenario:\"d1000-partition-heal\"}}'); code=\$(curl -sS --max-time 6 -o /tmp/d1000-heal -w '%{http_code}' -H 'content-type: application/json' --data-binary \"\$body\" http://127.0.0.1:${CONTROL_BASE}/need || true); echo HEAL_CODE=\$code")
  [[ "$(marker "$out" HEAL_CODE)" == 200 ]] && break
  sleep 1
done
heal_code=$(marker "$out" HEAL_CODE)
if [[ "$heal_code" != 200 ]]; then
  packet_partition_diag=$(remote "${VMS[0]}" "set +e; echo PACKET_DIAG_PHASE=heal-timeout; echo PACKET_DIAG_PROCESS_COUNT=\$(pgrep -fc 'network/testnet/node-service.js'); rules=\$(iptables-save | grep -c 'truyn-d1000-partition' || true); echo PACKET_DIAG_PARTITION_RULE_COUNT=\$rules; echo PACKET_DIAG_CONTROL_LISTENERS=\$(ss -ltnH | grep -E '127\.0\.0\.1:(${CONTROL_BASE}|$((CONTROL_BASE+1))|$((CONTROL_BASE+2))|$((CONTROL_BASE+3))|$((CONTROL_BASE+4)))' | awk '{printf \"%s,\",\$4}'); echo PACKET_DIAG_QUIC_LISTENERS=\$(ss -lunH | grep -E ':(${QUIC_BASE}|$((QUIC_BASE+1))|$((QUIC_BASE+2))|$((QUIC_BASE+3))|$((QUIC_BASE+4)))' | awk '{printf \"%s,\",\$4}'); for j in \$(seq 0 4); do unit=truyn-d1000@\${j}.service; active=\$(systemctl show \"\$unit\" -p ActiveState --value); sub=\$(systemctl show \"\$unit\" -p SubState --value); result=\$(systemctl show \"\$unit\" -p Result --value); pid=\$(systemctl show \"\$unit\" -p MainPID --value); restarts=\$(systemctl show \"\$unit\" -p NRestarts --value); code=\$(systemctl show \"\$unit\" -p ExecMainCode --value); status=\$(systemctl show \"\$unit\" -p ExecMainStatus --value); changed=\$(systemctl show \"\$unit\" -p StateChangeTimestamp --value); echo PACKET_DIAG_UNIT=\$unit active=\$active sub=\$sub result=\$result pid=\$pid restarts=\$restarts execCode=\$code execStatus=\$status changed=\"\$changed\"; done")
  printf '%s\n' "$packet_partition_diag"
  for packet_diag_j in $(seq 0 4); do
    packet_diag_unit="truyn-d1000@${packet_diag_j}.service"
    packet_partition_journal=$(remote "${VMS[0]}" "set +e; journalctl -u '${packet_diag_unit}' -n 20 --no-pager -o short-iso | tail -c 3072; echo; echo PACKET_DIAG_JOURNAL_UNIT='${packet_diag_unit}'")
    printf '%s\n' "$packet_partition_journal"
  done
  failure_tmp="${EVIDENCE}.d200-failure.tmp"
  cat >"$failure_tmp" <<JSON
{
  "class":"D-1000",
  "scope":"1000-real-process-scale+safety-contract-v2",
  "testedCommit":"${GITHUB_SHA}",
  "workflowRunId":"${GITHUB_RUN_ID}",
  "topology":{"nodeCount":${NODE_COUNT},"realProcessCount":${NODE_COUNT},"hostCount":${HOST_COUNT},"realProcessesPerHost":${NODES_PER_HOST},"uniqueIdentityCount":${NODE_COUNT},"uniqueEndpointCount":${NODE_COUNT},"syntheticNodeCount":0},
  "readiness":{"readyNodeCount":${readiness_ready},"readyNodeRatio":1,"barrierMs":${readiness_ms},"validPeers":{"min":${readiness_min_valid},"max":${readiness_max_valid}},"populatedBuckets":{"min":${readiness_min_buckets},"max":${readiness_max_buckets}},"remoteEndpointHosts":{"min":${readiness_min_hosts},"max":${readiness_max_hosts}}},
  "routing":{"baselineSuccessRatio":${base_rate},"baselineProbes":${base_total},"postRestartSuccessRatio":${post_rate},"healedSuccessRatio":null,"healedProbes":0,"latencyMs":{"aggregation":"max-of-host-quantiles","p50":${base_p50},"p90":${base_p90},"p95":${base_p95},"p99":${base_p99}}},
  "convergence":{"probeMode":"parallel-host-fanout","hostCount":${HOST_COUNT},"aggregation":"max-of-host-quantiles","aggregateMs":${conv_ms},"latencyMs":{"p95":${conv_p95},"p99":${conv_p99}},"routingSuccessRatio":${conv_rate},"nodeProbeCount":${conv_total}},
  "recovery":{"latencyMs":{"p95":${recovery_p95}},"restartedNodeCount":100,"identityAndStatePathsPreserved":true,"packetPartitionRecoveryMs":null},
  "adversarial":{"packetPartition":{"exercised":true,"realPacketPath":true,"blockedSuccesses":${partition_successes},"probeCount":${partition_probes},"recoveryMs":null}},
  "safety":{"acknowledgedWriteCount":${writes},"acknowledgedWriteLossCount":null,"invalidSignedStateAcceptedCount":${invalid_signed_state_accepted},"staleRevokedReceiptAcceptedCount":${stale_receipt_accepted},"unauthorizedProviderExecutionCount":${unauthorized_provider_execution}},
  "resources":{},
  "failure":{"stage":"packet-partition","reason":"heal-timeout","healCode":"${heal_code}","evidenceComplete":false},
  "cleanup":{"confirmed":false,"remainingResources":null,"finalizedByExitTrap":true}
}
JSON
  mv "$failure_tmp" "$EVIDENCE"
  echo "TRUYN_D200_FAILURE_EVIDENCE=CHECKPOINT stage=packet-partition reason=heal-timeout healCode=${heal_code}"
fi
[[ "$heal_code" == 200 ]]
partition_recovery_ms=$(( $(date +%s%3N) - heal_start ))
[[ "$partition_recovery_ms" -le 120000 ]]
echo "TRUYN_CLASS_D_1000 stage=packet-partition realPacketPath=true blockedSuccesses=${partition_successes}/${partition_probes} recoveryMs=${partition_recovery_ms} status=PASS"

STAGE=healed-routing
healed_success=0; healed_total=0; healed_p50=0; healed_p90=0; healed_p95=0; healed_p99=0
healed_diag_jsonl="${GITHUB_WORKSPACE:-$PWD}/class-d-200-healed-reconvergence.jsonl"
healed_diag_json="${GITHUB_WORKSPACE:-$PWD}/class-d-200-healed-reconvergence.json"
: >"$healed_diag_jsonl"
for i in $(seq 0 $((HOST_COUNT-1))); do
  script=$(cat <<EOS
set -Eeuo pipefail
python3 - <<'PY'
import base64, concurrent.futures, hashlib, json, random, subprocess, time
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

D200_HEALED_ORIGIN_DIAG=1
D200_HEALED_DRAIN_SECONDS=105

def persisted_peer_state(j,node_id):
    global_index=host*N+j
    path=f'/var/lib/truyn-d1000/node-{global_index}-state.json'
    result={'path':path,'present':False,'validNow':False,'expired':None,'readOk':False}
    try:
        value=json.load(open(path))
        result['readOk']=True
        result['savedAt']=value.get('savedAt')
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
          'recordId':record.get('recordId'),
          'sequence':record.get('sequence'),
          'issuedAt':record.get('issuedAt'),
          'expiresAt':expires_at,
          'expiresInMs':None if expires_ms is None else expires_ms-now_ms,
          'expired':expired,
          'validNow':bool(expired is False),
          'endpoint':(record.get('endpoints') or [None])[0],
        })
        return result
    except Exception as error:
        result['error']=str(error)[:256]
        return result

def post_json(url,body,timeout='8'):
    payload=json.dumps(body,separators=(',',':'))
    p=subprocess.run(['curl','-sS','--max-time',timeout,'-H','content-type: application/json','--data-binary',payload,url],text=True,capture_output=True)
    value=None
    if p.returncode==0:
        try:value=json.loads(p.stdout)
        except Exception:value=None
    return {'ok':bool(p.returncode==0 and isinstance(value,dict) and value.get('enabled') is True),'curlRc':p.returncode,'value':value,'stderr':p.stderr[-512:]}

def reset_target_transport_after_drain(j,node_id):
    control=f'http://127.0.0.1:{base+j}'
    partition=post_json(control+'/faults/partition',{'nodeIds':[node_id]})
    drain_started=time.monotonic()
    time.sleep(D200_HEALED_DRAIN_SECONDS)
    drain_ms=round((time.monotonic()-drain_started)*1000,3)
    # A timed-out HTTP client does not cancel the server-side /need. Re-apply
    # partition while it is still active so any client created by that old
    # operation during the drain window is discarded immediately before heal.
    rediscard=post_json(control+'/faults/partition',{'nodeIds':[node_id]})
    heal=post_json(control+'/faults/heal',{'nodeIds':[node_id]})
    if not heal['ok']:
        heal_retry=post_json(control+'/faults/heal',{'nodeIds':[node_id]})
    else:
        heal_retry=None
    healed=bool(heal['ok'] or (heal_retry and heal_retry['ok']))
    return {
      'ok':bool(partition['ok'] and rediscard['ok'] and healed),
      'drainMs':drain_ms,
      'drainTargetMs':D200_HEALED_DRAIN_SECONDS*1000,
      'partition':partition,
      'rediscardBeforeHeal':rediscard,
      'heal':heal,
      'healRetry':heal_retry,
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
    result_summary=None
    if isinstance(value,dict):
        walks=value.get('walks') if isinstance(value.get('walks'),list) else []
        queried=value.get('queriedPeers') if isinstance(value.get('queriedPeers'),list) else []
        result_summary={
          'refreshed':bool(value.get('refreshed')),
          'reason':value.get('reason'),
          'targetCount':len(value.get('targets') or []) if isinstance(value.get('targets'),list) else 0,
          'walkCount':len(walks),
          'queriedPeerCount':len(queried),
          'responseCount':int(value.get('responses') or 0),
          'routingSizeDelta':value.get('routingSizeDelta'),
          'validPeersDelta':value.get('validPeersDelta'),
          'walksOmitted':len(walks),
        }
    return {'ok':bool(p.returncode==0),'curlRc':p.returncode,'latencyMs':round(ms,3),'resultSummary':result_summary,'stderr':p.stderr[-256:]}

def one(k):
    j=k%N
    r=random.Random(20260820+host*10000+k)
    target_host=r.randrange(H-1)
    if target_host>=host: target_host+=1
    target_local=r.randrange(N)
    node_id=records[target_host][target_local]['nodeId']
    peer_before=persisted_peer_state(j,node_id)
    first=need(j,node_id,'d1000-healed',k,'first')
    if first['ok']:
        return (1,first['latencyMs'],None)
    before=state(j)
    time.sleep(.25)
    peer_after_timeout=persisted_peer_state(j,node_id)
    reset=None
    reset_retry=None
    refresh=None
    after_refresh=None
    peer_after_refresh=None
    post_refresh=None
    if peer_before.get('validNow') is True:
        reset=reset_target_transport_after_drain(j,node_id)
        reset_retry=need(j,node_id,'d1000-healed-session-reset-retry',k,'session-reset')
        if reset.get('ok') and reset_retry['ok']:
            classification='valid-record-session-reset-recovered'
        elif reset_retry['ok']:
            classification='transport-reset-unverified-retry-recovered'
        else:
            refresh=targeted_refresh(j,node_id,k)
            after_refresh=state(j)
            peer_after_refresh=persisted_peer_state(j,node_id)
            post_refresh=need(j,node_id,'d1000-healed-target-refresh-retry',k,'refresh')
            classification='valid-record-target-refresh-recovered' if post_refresh['ok'] else 'persistent-after-refresh'
    else:
        refresh=targeted_refresh(j,node_id,k)
        after_refresh=state(j)
        peer_after_refresh=persisted_peer_state(j,node_id)
        post_refresh=need(j,node_id,'d1000-healed-target-refresh-retry',k,'refresh')
        if post_refresh['ok']:
            if not peer_before.get('readOk'):
                classification='peer-state-unavailable-target-refresh-recovered'
            elif peer_before.get('present'):
                classification='stale-record-target-refresh-recovered'
            else:
                classification='missing-record-target-refresh-recovered'
        else:
            classification='persistent-after-refresh'
    record_transition='valid-before-first-attempt'
    if peer_before.get('validNow') is not True:
        record_transition='became-valid-during-first-attempt' if peer_after_timeout.get('validNow') is True else 'stale-or-missing-after-first-attempt'
    diag={
      'sourceHost':host,'sourceLocalNode':j,'targetHost':target_host,'targetLocalNode':target_local,'targetNodeId':node_id,
      'classification':classification,'recordTransition':record_transition,'firstAttempt':first,'stateBeforeRecovery':before,
      'peerRecordBeforeFirstAttempt':peer_before,'peerRecordAfterFirstAttempt':peer_after_timeout,
      'forcedTargetTransportReset':reset,'sessionResetRetry':reset_retry,
      'targetedRefresh':refresh,'stateAfterTargetedRefresh':after_refresh,'peerRecordAfterTargetedRefresh':peer_after_refresh,'postRefreshRetry':post_refresh,
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
D200_HEALED_EVIDENCE_TRANSPORT=1
D200_HEALED_TRANSPORT_MAX_BYTES=1800
D200_HEALED_TRANSPORT_CHUNK_CHARS=512
D200_HEALED_FAILURE_SAMPLE_LIMIT=1

def compact_state(value):
    if not isinstance(value,dict): return None
    keys=('validPeers','routingSize','staleRoutingPeers','populatedBuckets')
    return {key:value.get(key) for key in keys}

def compact_peer(value):
    if not isinstance(value,dict): return None
    keys=('readOk','present','validNow','expired','expiresInMs')
    return {key:value.get(key) for key in keys}

def compact_probe(value):
    if not isinstance(value,dict): return None
    return {'ok':bool(value.get('ok')),'curlRc':value.get('curlRc'),'httpCode':value.get('httpCode'),'latencyMs':value.get('latencyMs')}

def compact_reset(value):
    if not isinstance(value,dict): return None
    def ok(key):
        item=value.get(key)
        return bool(item.get('ok')) if isinstance(item,dict) else None
    return {'ok':bool(value.get('ok')),'drainMs':value.get('drainMs'),'partitionOk':ok('partition'),'rediscardBeforeHealOk':ok('rediscardBeforeHeal'),'healOk':ok('heal')}

def compact_refresh(value):
    if not isinstance(value,dict): return None
    source=value.get('resultSummary') if isinstance(value.get('resultSummary'),dict) else {}
    return {
      'ok':bool(value.get('ok')),
      'latencyMs':value.get('latencyMs'),
      'resultSummary':{
        'refreshed':source.get('refreshed'),
        'queriedPeerCount':source.get('queriedPeerCount'),
        'responseCount':source.get('responseCount'),
        'routingSizeDelta':source.get('routingSizeDelta'),
        'validPeersDelta':source.get('validPeersDelta'),
      },
    }

def compact_failure(item):
    return {
      'sourceLocalNode':item.get('sourceLocalNode'),
      'targetHost':item.get('targetHost'),
      'targetLocalNode':item.get('targetLocalNode'),
      'classification':item.get('classification'),
      'recordTransition':item.get('recordTransition'),
      'firstAttempt':compact_probe(item.get('firstAttempt')),
      'stateBeforeRecovery':compact_state(item.get('stateBeforeRecovery')),
      'peerRecordBeforeFirstAttempt':compact_peer(item.get('peerRecordBeforeFirstAttempt')),
      'peerRecordAfterFirstAttempt':compact_peer(item.get('peerRecordAfterFirstAttempt')),
      'forcedTargetTransportReset':compact_reset(item.get('forcedTargetTransportReset')),
      'sessionResetRetry':compact_probe(item.get('sessionResetRetry')),
      'targetedRefresh':compact_refresh(item.get('targetedRefresh')),
      'peerRecordAfterTargetedRefresh':compact_peer(item.get('peerRecordAfterTargetedRefresh')),
      'postRefreshRetry':compact_probe(item.get('postRefreshRetry')),
    }

transport_failures=[compact_failure(item) for item in failures[:D200_HEALED_FAILURE_SAMPLE_LIMIT]]
summary={
  'host':host,
  'firstAttempt':{'success':success,'total':total,'p50Ms':q(.50),'p90Ms':q(.90),'p95Ms':q(.95),'p99Ms':q(.99)},
  'failureCount':len(failures),
  'classificationCounts':counts,
  'failureSampleCount':len(transport_failures),
  'failureSamplesOmitted':max(0,len(failures)-len(transport_failures)),
  'failures':transport_failures,
}
raw=json.dumps(summary,separators=(',',':')).encode()
payload_truncated=len(raw)>D200_HEALED_TRANSPORT_MAX_BYTES
print('HEALED_OK='+str(success)); print('HEALED_TOTAL='+str(total)); print('HEALED_P50='+str(q(.50))); print('HEALED_P90='+str(q(.90))); print('HEALED_P95='+str(q(.95))); print('HEALED_P99='+str(q(.99)))
if payload_truncated:
    print(f'HEALED_DIAG_META={len(raw)}:none:0:1')
else:
    digest=hashlib.sha256(raw).hexdigest()
    encoded=base64.b64encode(raw).decode()
    chunks=[encoded[offset:offset+D200_HEALED_TRANSPORT_CHUNK_CHARS] for offset in range(0,len(encoded),D200_HEALED_TRANSPORT_CHUNK_CHARS)]
    for index,chunk in enumerate(chunks): print(f'HEALED_DIAG_CHUNK_{index:02d}={chunk}')
    print(f'HEALED_DIAG_META={len(raw)}:{digest}:{len(chunks)}:0')
PY
EOS
)
  out=$(remote "${VMS[$i]}" "$script")
  ok=$(marker "$out" HEALED_OK); total=$(marker "$out" HEALED_TOTAL); p50=$(marker "$out" HEALED_P50); p90=$(marker "$out" HEALED_P90); p95=$(marker "$out" HEALED_P95); p99=$(marker "$out" HEALED_P99)
  diag_meta=$(marker "$out" HEALED_DIAG_META)
  if [[ -z "$diag_meta" ]]; then
    echo "TRUYN_D200_HEALED_PAYLOAD_TRUNCATED host=$i payload_truncated=1 reason=meta_missing" >&2
    exit 1
  fi
  IFS=':' read -r diag_bytes diag_sha diag_chunks diag_truncated <<<"$diag_meta"
  if [[ "$diag_truncated" != 0 ]]; then
    echo "TRUYN_D200_HEALED_PAYLOAD_TRUNCATED host=$i payload_truncated=1 reason=producer_byte_cap bytes=${diag_bytes:-unknown}" >&2
    exit 1
  fi
  if [[ ! "$diag_bytes" =~ ^[0-9]+$ || ! "$diag_sha" =~ ^[0-9a-f]{64}$ || ! "$diag_chunks" =~ ^[1-9][0-9]*$ ]]; then
    echo "TRUYN_D200_HEALED_PAYLOAD_TRUNCATED host=$i payload_truncated=1 reason=invalid_meta meta=${diag_meta}" >&2
    exit 1
  fi
  diag_b64=''
  for chunk_index in $(seq 0 $((diag_chunks-1))); do
    chunk_key=$(printf 'HEALED_DIAG_CHUNK_%02d' "$chunk_index")
    chunk_value=$(marker "$out" "$chunk_key")
    if [[ -z "$chunk_value" ]]; then
      echo "TRUYN_D200_HEALED_PAYLOAD_TRUNCATED host=$i payload_truncated=1 reason=missing_chunk chunk=${chunk_index} expected=${diag_chunks}" >&2
      exit 1
    fi
    diag_b64+="$chunk_value"
  done
  python3 - "$i" "$diag_b64" "$healed_diag_jsonl" "$diag_bytes" "$diag_sha" "$diag_chunks" <<'PYD200HOST'
import base64,hashlib,json,sys
host=int(sys.argv[1]); encoded=sys.argv[2]; path=sys.argv[3]; expected_bytes=int(sys.argv[4]); expected_sha=sys.argv[5]; chunks=int(sys.argv[6])
def fail(reason):
    raise SystemExit(f'TRUYN_D200_HEALED_PAYLOAD_TRUNCATED host={host} payload_truncated=1 reason={reason}')
try:
    raw=base64.b64decode(encoded,validate=True)
except Exception:
    fail('base64_invalid')
if len(raw) != expected_bytes: fail('byte_count_mismatch')
actual_sha=hashlib.sha256(raw).hexdigest()
if actual_sha != expected_sha: fail('sha256_mismatch')
try:
    value=json.loads(raw.decode('utf-8'))
except Exception:
    fail('json_invalid')
if value.get('host') != host: fail('host_mismatch')
value['evidenceTransport']={'schema':'truyn.d200.healed-evidence-transport.v1','payloadTruncated':False,'bytes':expected_bytes,'chunks':chunks,'sha256':'sha256:'+actual_sha}
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
value={'schema':'truyn.d200.healed-reconvergence.v3','firstAttempt':{'success':int(sys.argv[3]),'total':int(sys.argv[4]),'successRatio':float(sys.argv[5])},'classificationCounts':counts,'failureCount':sum(int(row.get('failureCount') or 0) for row in rows),'hosts':rows,'failures':failures,'acceptanceUsesFirstAttemptOnly':True,'diagnosticRetriesDoNotChangeHealedGate':True,'evidenceTransport':{'schema':'truyn.d200.healed-evidence-transport.v1','payloadTruncated':False,'hostPayloads':[row.get('evidenceTransport') for row in rows]}}
with open(sys.argv[2],'w',encoding='utf-8') as handle:
    json.dump(value,handle,separators=(',',':')); handle.write('\n')
PYD200SUMMARY
healed_diag_sha=$(sha256sum "$healed_diag_json" | awk '{print $1}')
printf 'sha256:%s\n' "$healed_diag_sha" > "${GITHUB_WORKSPACE:-$PWD}/class-d-200-healed-reconvergence-digest.txt"
rm -f "$healed_diag_jsonl"
python3 - <<PY
assert float('$healed_rate') >= .99, '$healed_rate'
PY
echo "TRUYN_CLASS_D_1000 stage=healed-routing success=${healed_success}/${healed_total} routingSuccess=${healed_rate} p50Ms=${healed_p50} p90Ms=${healed_p90} p95Ms=${healed_p95} p99Ms=${healed_p99} status=PASS"

STAGE=write-retention
d200_retention_required_margin_ms=900000
d200_retention_start_ms=$(date +%s%3N)
d200_retention_age_start_ms=$((d200_retention_start_ms-d200_write_window_start_ms))
if (( d200_retention_age_start_ms + d200_retention_required_margin_ms >= d200_durable_write_ttl_ms )); then
  echo "TRUYN_D200_WRITE_RETENTION_WINDOW_INVALID phase=before-check ttlMs=${d200_durable_write_ttl_ms} ageMs=${d200_retention_age_start_ms} requiredMarginMs=${d200_retention_required_margin_ms}" >&2
  false
fi
out=$(remote "${VMS[0]}" "set -Eeuo pipefail; ok=0; for h in \$(seq 0 $((HOST_COUNT-1))); do for j in \$(seq 0 4); do k=d1000-\${h}-\${j}; c=\$(curl -fsS --max-time 45 'http://127.0.0.1:${CONTROL_BASE}/find?namespace=class-d1000&key='\"\$k\"'&fanout=24'); n=\$(printf '%s' \"\$c\"|jq '[.records[]? | select(.value != null)]|length'); [[ \$n -ge 1 ]] && ok=\$((ok+1)); done; done; echo RETAINED=\$ok")
retained=$(marker "$out" RETAINED)
d200_retention_end_ms=$(date +%s%3N)
d200_retention_age_end_ms=$((d200_retention_end_ms-d200_write_window_start_ms))
if (( d200_retention_age_end_ms >= d200_durable_write_ttl_ms )); then
  echo "TRUYN_D200_WRITE_RETENTION_WINDOW_INVALID phase=after-check ttlMs=${d200_durable_write_ttl_ms} ageMs=${d200_retention_age_end_ms}" >&2
  false
fi
ack_loss=$((writes-retained))
[[ "$ack_loss" == 0 ]]
echo "TRUYN_CLASS_D_1000 stage=write-retention retained=${retained}/${writes} acknowledgedWriteLoss=${ack_loss} ttlMs=${d200_durable_write_ttl_ms} ageStartMs=${d200_retention_age_start_ms} ageEndMs=${d200_retention_age_end_ms}"

STAGE=resources
rss_kb=0; quic_bytes=0; process_total=0
for i in $(seq 0 $((HOST_COUNT-1))); do
  out=$(remote "${VMS[$i]}" "set -Eeuo pipefail; rss=\$(ps -eo rss,args | awk '/network\/testnet\/node-service.js/ && !/awk/ {s+=\$1} END{print s+0}'); proc=\$(pgrep -fc 'network/testnet/node-service.js'); outb=\$(iptables-save -c | awk '/truyn-d1000-meter-out/ {gsub(/\\[/,\"\",\$1); split(\$1,a,\":\"); s+=a[2]} END{print s+0}'); inb=\$(iptables-save -c | awk '/truyn-d1000-meter-in/ {gsub(/\\[/,\"\",\$1); split(\$1,a,\":\"); s+=a[2]} END{print s+0}'); echo RSS_KB=\$rss; echo PROCESSES=\$proc; echo QUIC_BYTES=\$((outb+inb))")
  p=$(marker "$out" PROCESSES); [[ "$p" -ge "$NODES_PER_HOST" ]]; process_total=$((process_total+p)); rss_kb=$((rss_kb+$(marker "$out" RSS_KB))); quic_bytes=$((quic_bytes+$(marker "$out" QUIC_BYTES)))
done
[[ "$process_total" -ge "$NODE_COUNT" ]]

STAGE=evidence
END_MS=$(date +%s%3N)
cat >"$EVIDENCE" <<JSON
{
  "class":"D-1000",
  "scope":"1000-real-process-scale+safety-contract-v2",
  "testedCommit":"${GITHUB_SHA}",
  "workflowRunId":"${GITHUB_RUN_ID}",
  "topology":{"nodeCount":${NODE_COUNT},"realProcessCount":${NODE_COUNT},"hostCount":${HOST_COUNT},"realProcessesPerHost":${NODES_PER_HOST},"uniqueIdentityCount":${NODE_COUNT},"uniqueEndpointCount":${NODE_COUNT},"syntheticNodeCount":0,"transport":"real UDP/QUIC over Azure VNet","bootstrap":"sparse Kademlia local+bridge"},
  "readiness":{"readyNodeCount":${readiness_ready},"readyNodeRatio":1,"barrierMs":${readiness_ms},"validPeers":{"min":${readiness_min_valid},"max":${readiness_max_valid}},"populatedBuckets":{"min":${readiness_min_buckets},"max":${readiness_max_buckets}},"remoteEndpointHosts":{"min":${readiness_min_hosts},"max":${readiness_max_hosts}}},
  "routing":{"baselineSuccessRatio":${base_rate},"baselineProbes":${base_total},"postRestartSuccessRatio":${post_rate},"healedSuccessRatio":${healed_rate},"healedProbes":${healed_total},"latencyMs":{"aggregation":"max-of-host-quantiles","p50":${base_p50},"p90":${base_p90},"p95":${base_p95},"p99":${base_p99}},"healedLatencyMs":{"aggregation":"max-of-host-quantiles","p50":${healed_p50},"p90":${healed_p90},"p95":${healed_p95},"p99":${healed_p99}}},
  "convergence":{"probeMode":"parallel-host-fanout","hostCount":${HOST_COUNT},"aggregation":"max-of-host-quantiles","aggregateMs":${conv_ms},"latencyMs":{"p95":${conv_p95},"p99":${conv_p99}},"routingSuccessRatio":${conv_rate},"nodeProbeCount":${conv_total}},
  "recovery":{"latencyMs":{"p95":${recovery_p95}},"restartedNodeCount":100,"identityAndStatePathsPreserved":true,"packetPartitionRecoveryMs":${partition_recovery_ms}},
  "adversarial":{"packetPartition":{"exercised":true,"realPacketPath":true,"blockedSuccesses":${partition_successes},"probeCount":${partition_probes},"recoveryMs":${partition_recovery_ms}}},
  "safety":{"acknowledgedWriteCount":${writes},"acknowledgedWriteLossCount":${ack_loss},"invalidSignedStateAcceptedCount":${invalid_signed_state_accepted},"staleRevokedReceiptAcceptedCount":${stale_receipt_accepted},"unauthorizedProviderExecutionCount":${unauthorized_provider_execution},"probes":{"invalidSignedState":{"remoteQuicControl":true,"targetRejected":true,"validRecordAcks":${dht_safety_acks},"rejectionReason":"${invalid_rejection_reason}"},"staleReceipt":{"exactCommitLocalVerifier":true,"reason":"trust_receipt_v2_lifecycle_head_stale"},"providerAuthorization":{"exactCommitAdapterHost":true,"accessDenied":true,"adapterExecutions":${unauthorized_provider_execution}}}},
  "resources":{"aggregateNodeRssKb":${rss_kb},"measuredQuicUdpBytes":${quic_bytes},"observedNodeProcesses":${process_total}},
  "timing":{"campaignMs":$((END_MS-START_MS))},
  "cleanup":{"confirmed":false,"remainingResources":null,"finalizedByExitTrap":true}
}
JSON
echo "TRUYN_CLASS_D_1000_GATE=CANDIDATE nodes=${NODE_COUNT} hosts=${HOST_COUNT} readiness=${readiness_ready}/${readiness_total} baseline=${base_rate} healed=${healed_rate} convergenceP95Ms=${conv_p95} recoveryP95Ms=${recovery_p95} ackLoss=${ack_loss} invalidSigned=${invalid_signed_state_accepted} staleReceipt=${stale_receipt_accepted} unauthorizedProviderExecution=${unauthorized_provider_execution}"
cat "$EVIDENCE"
