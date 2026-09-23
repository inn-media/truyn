#!/usr/bin/env bash
set -Eeuo pipefail

: "${HOST_INDEX:?HOST_INDEX is required}"
: "${NODES_PER_HOST:?NODES_PER_HOST is required}"
: "${CONTROL_BASE:?CONTROL_BASE is required}"
: "${BOOTSTRAP_MAX_PEERS_PER_NODE:?BOOTSTRAP_MAX_PEERS_PER_NODE is required}"
: "${BOOTSTRAP_PLAN_SEED:?BOOTSTRAP_PLAN_SEED is required}"

BOOTSTRAP_REQUEST_TIMEOUT_S="${BOOTSTRAP_REQUEST_TIMEOUT_S:-90}"
REFRESH_SERVER_TIMEOUT_MS="${REFRESH_SERVER_TIMEOUT_MS:-120000}"
REFRESH_CLIENT_TIMEOUT_S="${REFRESH_CLIENT_TIMEOUT_S:-135}"
REFRESH_ATTEMPTS="${REFRESH_ATTEMPTS:-2}"
NODE_DIR="$(mktemp -d)"
trap 'rm -rf "$NODE_DIR"' EXIT

node_worker() {
  local j="$1" node_id payload records unique bytes control_url refresh_payload refresh_result refresh_rc refresh_reason readiness valid buckets endpoints hosts attempt
  node_id="$(jq -r --argjson host "$HOST_INDEX" --argjson node "$j" '.[$host][$node].nodeId' /tmp/records-by-host.json)"
  payload="$(jq -c --arg node "$node_id" '{records:.[$node]}' /tmp/bootstrap-plan-by-node.json)"
  records="$(jq -r --arg node "$node_id" '.[$node] | length' /tmp/bootstrap-plan-by-node.json)"
  [[ "$records" -eq "$BOOTSTRAP_MAX_PEERS_PER_NODE" ]]
  if printf '%s' "$payload" | jq -e --arg node "$node_id" '.records | any(.nodeId == $node)' >/dev/null; then
    echo "self peer leaked for $node_id" >&2; return 1
  fi
  unique="$(printf '%s' "$payload" | jq -r '.records[].nodeId' | sort -u | wc -l | tr -d ' ')"
  [[ "$unique" -eq "$records" ]]
  bytes="$(printf '%s' "$payload" | wc -c | tr -d ' ')"
  [[ "$bytes" -lt 900000 ]]

  control_url="http://127.0.0.1:$(( CONTROL_BASE + j ))"
  curl -fsS --max-time "$BOOTSTRAP_REQUEST_TIMEOUT_S" -H 'content-type: application/json' --data-binary "$payload" "${control_url}/bootstrap" >/dev/null

  refresh_payload="$(jq -cn --arg seed "${BOOTSTRAP_PLAN_SEED}:bootstrap-refresh:${HOST_INDEX}:${j}" --argjson timeoutMs "$REFRESH_SERVER_TIMEOUT_MS" '{targetCount:'"$BOOTSTRAP_MAX_PEERS_PER_NODE"',maxRounds:4,targetConcurrency:4,timeoutMs:$timeoutMs,seed:$seed}')"
  refresh_result=''; refresh_rc=1; refresh_reason=none
  for attempt in $(seq 1 "$REFRESH_ATTEMPTS"); do
    set +e
    refresh_result="$(curl -fsS --max-time "$REFRESH_CLIENT_TIMEOUT_S" -H 'content-type: application/json' --data-binary "$refresh_payload" "${control_url}/dht/refresh")"
    refresh_rc=$?
    set -e
    refresh_reason=none
    if [[ "$refresh_rc" -eq 0 ]]; then
      refresh_reason="$(printf '%s' "$refresh_result" | jq -r '.reason // "none"' 2>/dev/null || echo invalid-json)"
      if printf '%s' "$refresh_result" | jq -e '.refreshed == true' >/dev/null 2>&1; then break; fi
      refresh_rc=70
    fi
    echo "TRUYN_D200_BOOTSTRAP_REFRESH_RETRY host=${HOST_INDEX} node=${j} attempt=${attempt} rc=${refresh_rc} reason=${refresh_reason}" >&2
    [[ "$attempt" -lt "$REFRESH_ATTEMPTS" ]] && sleep $((attempt * 2))
  done
  [[ "$refresh_rc" -eq 0 ]]
  [[ "$(printf '%s' "$refresh_result" | jq -r '.refreshed')" == true ]]

  readiness="$(curl -fsS --max-time 20 "${control_url}/dht/readiness")"
  [[ "$(printf '%s' "$readiness" | jq -r '.refresh.status')" == refreshed ]]
  valid="$(printf '%s' "$readiness" | jq -r '.validPeers')"
  buckets="$(printf '%s' "$readiness" | jq -r '.populatedBuckets')"
  endpoints="$(printf '%s' "$readiness" | jq -r '.remoteEndpointDiversity.endpointCount')"
  hosts="$(printf '%s' "$readiness" | jq -r '.remoteEndpointDiversity.hostCount')"
  [[ "$valid" -ge "$records" ]]

  jq -n --argjson node "$j" --argjson records "$records" --argjson bytes "$bytes" --argjson valid "$valid" --argjson buckets "$buckets" --argjson endpoints "$endpoints" --argjson hosts "$hosts" \
    '{node:$node,records:$records,bytes:$bytes,valid:$valid,buckets:$buckets,endpoints:$endpoints,hosts:$hosts}' >"$NODE_DIR/${j}.json"
}

started_ms="$(date +%s%3N)"
pids=()
for j in $(seq 0 $((NODES_PER_HOST-1))); do
  node_worker "$j" >"$NODE_DIR/${j}.log" 2>&1 &
  pids+=("$!")
done
failed=0
for pid in "${pids[@]}"; do
  if ! wait "$pid"; then failed=1; fi
done
if [[ "$failed" != 0 ]]; then
  for j in $(seq 0 $((NODES_PER_HOST-1))); do
    [[ -s "$NODE_DIR/${j}.log" ]] && sed "s/^/TRUYN_BOOTSTRAP_NODE host=${HOST_INDEX} node=${j} /" "$NODE_DIR/${j}.log" >&2 || true
  done
  exit 1
fi

jq -s '.' "$NODE_DIR"/*.json >"$NODE_DIR/all.json"
[[ "$(jq 'length' "$NODE_DIR/all.json")" -eq "$NODES_PER_HOST" ]]
min_records="$(jq '[.[].records]|min' "$NODE_DIR/all.json")"
max_records="$(jq '[.[].records]|max' "$NODE_DIR/all.json")"
min_bytes="$(jq '[.[].bytes]|min' "$NODE_DIR/all.json")"
max_bytes="$(jq '[.[].bytes]|max' "$NODE_DIR/all.json")"
mean_bytes="$(jq '[.[].bytes]|add/length|floor' "$NODE_DIR/all.json")"
min_valid="$(jq '[.[].valid]|min' "$NODE_DIR/all.json")"
max_valid="$(jq '[.[].valid]|max' "$NODE_DIR/all.json")"
min_buckets="$(jq '[.[].buckets]|min' "$NODE_DIR/all.json")"
max_buckets="$(jq '[.[].buckets]|max' "$NODE_DIR/all.json")"
min_endpoints="$(jq '[.[].endpoints]|min' "$NODE_DIR/all.json")"
max_endpoints="$(jq '[.[].endpoints]|max' "$NODE_DIR/all.json")"
min_hosts="$(jq '[.[].hosts]|min' "$NODE_DIR/all.json")"
max_hosts="$(jq '[.[].hosts]|max' "$NODE_DIR/all.json")"
ended_ms="$(date +%s%3N)"

printf 'BOOTSTRAP_MS=%s\n' "$((ended_ms-started_ms))"
printf 'BOOTSTRAP_PLAN_NODE_COUNT=%s\n' "$(jq -r '.nodeCount' /tmp/bootstrap-plan-summary.json)"
printf 'BOOTSTRAP_PLAN_MIN_RECORDS=%s\n' "$min_records"
printf 'BOOTSTRAP_PLAN_MAX_RECORDS=%s\n' "$max_records"
printf 'BOOTSTRAP_PLAN_ALL_TO_ALL=%s\n' "$(jq -r '.allToAll' /tmp/bootstrap-plan-summary.json)"
printf 'BOOTSTRAP_PLAN_MIN_FAILURE_DOMAINS=%s\n' "$(jq -r '.minFailureDomains' /tmp/bootstrap-plan-summary.json)"
printf 'BOOTSTRAP_PLAN_MAX_FAILURE_DOMAINS=%s\n' "$(jq -r '.maxFailureDomains' /tmp/bootstrap-plan-summary.json)"
printf 'BOOTSTRAP_MIN_BYTES=%s\n' "$min_bytes"
printf 'BOOTSTRAP_MAX_BYTES=%s\n' "$max_bytes"
printf 'BOOTSTRAP_MEAN_BYTES=%s\n' "$mean_bytes"
printf 'BOOTSTRAP_REFRESH_COUNT=%s\n' "$NODES_PER_HOST"
printf 'BOOTSTRAP_REFRESH_STATUS=refreshed\n'
printf 'BOOTSTRAP_REFRESH_MIN_VALID=%s\n' "$min_valid"
printf 'BOOTSTRAP_REFRESH_MAX_VALID=%s\n' "$max_valid"
printf 'BOOTSTRAP_REFRESH_MIN_BUCKETS=%s\n' "$min_buckets"
printf 'BOOTSTRAP_REFRESH_MAX_BUCKETS=%s\n' "$max_buckets"
printf 'BOOTSTRAP_REFRESH_MIN_ENDPOINTS=%s\n' "$min_endpoints"
printf 'BOOTSTRAP_REFRESH_MAX_ENDPOINTS=%s\n' "$max_endpoints"
printf 'BOOTSTRAP_REFRESH_MIN_HOSTS=%s\n' "$min_hosts"
printf 'BOOTSTRAP_REFRESH_MAX_HOSTS=%s\n' "$max_hosts"
printf 'BOOTSTRAP_EXECUTION_MODE=parallel-nodes\n'
printf 'BOOTSTRAP_NODE_CONCURRENCY=%s\n' "$NODES_PER_HOST"
printf 'BOOTSTRAP_REFRESH_SERVER_DEADLINE_MS=%s\n' "$REFRESH_SERVER_TIMEOUT_MS"
printf 'BOOTSTRAP_REFRESH_CLIENT_DEADLINE_MS=%s\n' "$((REFRESH_CLIENT_TIMEOUT_S*1000))"
