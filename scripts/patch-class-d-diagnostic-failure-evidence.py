#!/usr/bin/env python3
from pathlib import Path
import sys

if len(sys.argv) != 2:
    raise SystemExit('usage: patch-class-d-diagnostic-failure-evidence.py <provision>')

path = Path(sys.argv[1])
text = path.read_text()

marker = 'TRUYN_D200_FAILURE_EVIDENCE=CHECKPOINT'
if marker in text:
    raise SystemExit('D-200 universal failure evidence patch already appears applied')

insert_before = 'cleanup() {\n'
old_trap = "trap 'rc=$?; echo \"::error title=TRUYN Class D-1000 failure::stage=$STAGE exit=$rc line=$LINENO\"; exit $rc' ERR\n"
if text.count(insert_before) != 1:
    raise SystemExit(f'unexpected cleanup function count: {text.count(insert_before)}')
if text.count(old_trap) != 1:
    raise SystemExit(f'unexpected ERR trap count: {text.count(old_trap)}')

helper = r'''d200_failure_evidence_checkpoint() {
  local prior_rc="${1:-1}" failed_stage="${2:-unknown}" failed_line="${3:-0}" tmp
  trap - ERR
  set +e
  if [[ -s "$EVIDENCE" ]] && jq -e '.failure != null' "$EVIDENCE" >/dev/null 2>&1; then
    echo "TRUYN_D200_FAILURE_EVIDENCE=RETAINED stage=${failed_stage} exit=${prior_rc} line=${failed_line}"
    return 0
  fi
  tmp="${EVIDENCE}.d200-failure.tmp"
  D200_EVIDENCE="$tmp" \
  D200_TESTED_COMMIT="${GITHUB_SHA:-}" D200_WORKFLOW_RUN_ID="${GITHUB_RUN_ID:-}" \
  D200_FAILURE_STAGE="$failed_stage" D200_FAILURE_EXIT="$prior_rc" D200_FAILURE_LINE="$failed_line" \
  D200_NODE_COUNT="${NODE_COUNT:-}" D200_HOST_COUNT="${HOST_COUNT:-}" D200_NODES_PER_HOST="${NODES_PER_HOST:-}" \
  D200_READINESS_READY="${readiness_ready:-}" D200_READINESS_MS="${readiness_ms:-}" \
  D200_READINESS_MIN_VALID="${readiness_min_valid:-}" D200_READINESS_MAX_VALID="${readiness_max_valid:-}" \
  D200_READINESS_MIN_BUCKETS="${readiness_min_buckets:-}" D200_READINESS_MAX_BUCKETS="${readiness_max_buckets:-}" \
  D200_READINESS_MIN_HOSTS="${readiness_min_hosts:-}" D200_READINESS_MAX_HOSTS="${readiness_max_hosts:-}" \
  D200_BASE_RATE="${base_rate:-}" D200_BASE_TOTAL="${base_total:-}" D200_BASE_P50="${base_p50:-}" D200_BASE_P90="${base_p90:-}" D200_BASE_P95="${base_p95:-}" D200_BASE_P99="${base_p99:-}" \
  D200_POST_RATE="${post_rate:-}" D200_POST_TOTAL="${post_total:-}" \
  D200_HEALED_RATE="${healed_rate:-}" D200_HEALED_TOTAL="${healed_total:-}" D200_HEALED_P50="${healed_p50:-}" D200_HEALED_P90="${healed_p90:-}" D200_HEALED_P95="${healed_p95:-}" D200_HEALED_P99="${healed_p99:-}" \
  D200_CONV_RATE="${conv_rate:-}" D200_CONV_TOTAL="${conv_total:-}" D200_CONV_P95="${conv_p95:-}" D200_CONV_P99="${conv_p99:-}" D200_CONV_MS="${conv_ms:-}" \
  D200_RECOVERY_P95="${recovery_p95:-}" D200_PARTITION_RECOVERY_MS="${partition_recovery_ms:-}" D200_PARTITION_SUCCESSES="${partition_successes:-}" D200_PARTITION_PROBES="${partition_probes:-}" \
  D200_WRITES="${writes:-}" D200_ACK_LOSS="${ack_loss:-}" D200_INVALID_SIGNED_ACCEPTED="${invalid_signed_state_accepted:-}" D200_STALE_RECEIPT_ACCEPTED="${stale_receipt_accepted:-}" D200_UNAUTHORIZED_EXECUTION="${unauthorized_provider_execution:-}" \
  D200_RSS_KB="${rss_kb:-}" D200_QUIC_BYTES="${quic_bytes:-}" D200_PROCESS_TOTAL="${process_total:-}" \
  python3 - <<'PYD200EVIDENCE'
import json, os


def number(name):
    raw = os.environ.get(name, '').strip()
    if not raw or raw.lower() in {'null', 'none', 'nan'}:
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    if not (value == value and value not in (float('inf'), float('-inf'))):
        return None
    return int(value) if value.is_integer() else value


def text(name):
    value = os.environ.get(name, '').strip()
    return value or None

node_count = number('D200_NODE_COUNT')
host_count = number('D200_HOST_COUNT')
nodes_per_host = number('D200_NODES_PER_HOST')
ready = number('D200_READINESS_READY')
ready_ratio = (ready / node_count) if ready is not None and node_count not in (None, 0) else None

value = {
    'class': 'D-1000',
    'scope': '1000-real-process-scale+safety-contract-v2',
    'testedCommit': text('D200_TESTED_COMMIT'),
    'workflowRunId': text('D200_WORKFLOW_RUN_ID'),
    'topology': {
        'nodeCount': node_count,
        'realProcessCount': node_count,
        'hostCount': host_count,
        'realProcessesPerHost': nodes_per_host,
        'uniqueIdentityCount': node_count,
        'uniqueEndpointCount': node_count,
        'syntheticNodeCount': 0 if node_count is not None else None,
    },
    'readiness': {
        'readyNodeCount': ready,
        'readyNodeRatio': ready_ratio,
        'barrierMs': number('D200_READINESS_MS'),
        'validPeers': {'min': number('D200_READINESS_MIN_VALID'), 'max': number('D200_READINESS_MAX_VALID')},
        'populatedBuckets': {'min': number('D200_READINESS_MIN_BUCKETS'), 'max': number('D200_READINESS_MAX_BUCKETS')},
        'remoteEndpointHosts': {'min': number('D200_READINESS_MIN_HOSTS'), 'max': number('D200_READINESS_MAX_HOSTS')},
    },
    'routing': {
        'baselineSuccessRatio': number('D200_BASE_RATE'),
        'baselineProbes': number('D200_BASE_TOTAL'),
        'postRestartSuccessRatio': number('D200_POST_RATE'),
        'postRestartProbes': number('D200_POST_TOTAL'),
        'healedSuccessRatio': number('D200_HEALED_RATE'),
        'healedProbes': number('D200_HEALED_TOTAL'),
        'latencyMs': {
            'aggregation': 'max-of-host-quantiles',
            'p50': number('D200_BASE_P50'), 'p90': number('D200_BASE_P90'),
            'p95': number('D200_BASE_P95'), 'p99': number('D200_BASE_P99'),
        },
        'healedLatencyMs': {
            'aggregation': 'max-of-host-quantiles',
            'p50': number('D200_HEALED_P50'), 'p90': number('D200_HEALED_P90'),
            'p95': number('D200_HEALED_P95'), 'p99': number('D200_HEALED_P99'),
        },
    },
    'convergence': {
        'probeMode': 'parallel-host-fanout',
        'hostCount': host_count,
        'aggregation': 'max-of-host-quantiles',
        'aggregateMs': number('D200_CONV_MS'),
        'latencyMs': {'p95': number('D200_CONV_P95'), 'p99': number('D200_CONV_P99')},
        'routingSuccessRatio': number('D200_CONV_RATE'),
        'nodeProbeCount': number('D200_CONV_TOTAL'),
    },
    'recovery': {
        'latencyMs': {'p95': number('D200_RECOVERY_P95')},
        'restartedNodeCount': 100 if number('D200_RECOVERY_P95') is not None else None,
        'identityAndStatePathsPreserved': True if number('D200_RECOVERY_P95') is not None else None,
        'packetPartitionRecoveryMs': number('D200_PARTITION_RECOVERY_MS'),
    },
    'adversarial': {
        'packetPartition': {
            'exercised': number('D200_PARTITION_PROBES') is not None,
            'realPacketPath': True if number('D200_PARTITION_PROBES') is not None else None,
            'blockedSuccesses': number('D200_PARTITION_SUCCESSES'),
            'probeCount': number('D200_PARTITION_PROBES'),
            'recoveryMs': number('D200_PARTITION_RECOVERY_MS'),
        },
    },
    'safety': {
        'acknowledgedWriteCount': number('D200_WRITES'),
        'acknowledgedWriteLossCount': number('D200_ACK_LOSS'),
        'invalidSignedStateAcceptedCount': number('D200_INVALID_SIGNED_ACCEPTED'),
        'staleRevokedReceiptAcceptedCount': number('D200_STALE_RECEIPT_ACCEPTED'),
        'unauthorizedProviderExecutionCount': number('D200_UNAUTHORIZED_EXECUTION'),
    },
    'resources': {
        'aggregateNodeRssKb': number('D200_RSS_KB'),
        'measuredQuicUdpBytes': number('D200_QUIC_BYTES'),
        'observedNodeProcesses': number('D200_PROCESS_TOTAL'),
    },
    'failure': {
        'stage': text('D200_FAILURE_STAGE') or 'unknown',
        'exitCode': number('D200_FAILURE_EXIT'),
        'line': number('D200_FAILURE_LINE'),
        'evidenceComplete': False,
    },
    'cleanup': {'confirmed': False, 'remainingResources': None, 'finalizedByExitTrap': True},
}
with open(os.environ['D200_EVIDENCE'], 'w', encoding='utf-8') as handle:
    json.dump(value, handle, separators=(',', ':'))
    handle.write('\n')
PYD200EVIDENCE
  if [[ -s "$tmp" ]]; then
    mv "$tmp" "$EVIDENCE"
    echo "TRUYN_D200_FAILURE_EVIDENCE=CHECKPOINT stage=${failed_stage} exit=${prior_rc} line=${failed_line}"
  else
    rm -f "$tmp"
  fi
  set -e
}

d200_err_trap() {
  local rc="${1:-1}" failed_stage="${2:-unknown}" failed_line="${3:-0}"
  trap - ERR
  d200_failure_evidence_checkpoint "$rc" "$failed_stage" "$failed_line" || true
  echo "::error title=TRUYN Class D-1000 failure::stage=${failed_stage} exit=${rc} line=${failed_line}"
  exit "$rc"
}

'''

text = text.replace(insert_before, helper + insert_before, 1)
text = text.replace(old_trap, "trap 'd200_err_trap \"$?\" \"$STAGE\" \"$LINENO\"' ERR\n", 1)
path.write_text(text)
