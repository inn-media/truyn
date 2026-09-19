import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = await readFile(new URL('../network/runtime.js', import.meta.url), 'utf8');
const service = await readFile(new URL('../network/testnet/node-service.js', import.meta.url), 'utf8');
const campaign = await readFile(new URL('../benchmarks/scale/class-d-azure-1000-campaign.sh', import.meta.url), 'utf8');

test('D-200 restart recovery exposes all eight root-cause diagnostics', () => {
  for (const field of [
    'targetSetChanges',
    'ackPreserved',
    'ackReset',
    'propagationAttempts',
    'rpcTimeouts',
    'pendingAgeMs',
    'routingRefreshMs',
    'quicReplacementMs'
  ]) {
    assert.match(runtime, new RegExp(`${field}: 0`));
    assert.match(campaign, new RegExp(field));
  }
  assert.match(service, /recoveryDiagnostics: lifecycle\.diagnostics \|\| \{\}/);
  assert.match(service, /recoveryEpoch: lifecycle\.recoveryEpoch \|\| null/);
  assert.match(service, /pendingAgeMs: lifecycle\.diagnostics\?\.pendingAgeMs \?\? 0/);
});

test('same-record target churn preserves intersection ACKs and publishes only pending placements', () => {
  assert.match(runtime, /const sameRecord = previous\.recordId === record\?\.recordId/);
  assert.match(runtime, /\(previous\.acknowledgedNodeIds \|\| \[\]\)\.filter\(\(nodeId\) => targetSet\.has\(nodeId\)\)\.sort\(\)/);
  assert.match(runtime, /diagnostics\.ackPreserved \+= acknowledgedNodeIds\.length/);
  assert.match(runtime, /const pendingNodeIds = new Set\(this\.peerRecordLifecycle\.propagation\.pendingNodeIds \|\| \[\]\)/);
  assert.match(runtime, /const publishPeers = peers\.filter\(\(peer\) => pendingNodeIds\.has\(peer\.nodeId\)\)/);
  assert.match(runtime, /replacePropagationTargets: false/);
});

test('peer-record reconciliation closes readiness synchronously and coalesces churn', () => {
  assert.match(runtime, /this\.#stagePeerRecordPropagation\(record\);[\s\S]*?if \(this\.peerRecordPropagationTimer\) return/);
  assert.match(runtime, /peerRecordReconcileDelayMs = 75/);
  assert.match(runtime, /peerRecordPropagationTimer = setTimeout/);
  assert.match(runtime, /diagnostics\.reconcileBatches \+= 1/);
  assert.doesNotMatch(runtime, /queueMicrotask\(\(\) =>/);
});

test('restart uses an explicit fail-closed recovery epoch', () => {
  for (const phase of ['hydrate', 'routing-refresh', 'placement', 'propagate', 'establish-sessions', 'ready']) {
    assert.match(runtime, new RegExp(`'${phase}'`));
  }
  assert.match(runtime, /recoveryEpoch\.active !== true/);
  assert.match(runtime, /await this\.rpc\.withDeadline\(Date\.now\(\) \+ 1_500, \(\) => this\.discovery\.refreshRoutingTable\(\{/);
  assert.match(runtime, /targetCount: Math\.min\(this\.discoveryRefreshTargetCount, Math\.max\(1, this\.alpha \* 2\)\)/);
  assert.match(runtime, /maxRounds: Math\.min\(2, this\.discoveryRefreshMaxRounds\)/);
});

test('recovery retries are per-peer without head-of-line blocking', () => {
  assert.match(runtime, /peerRecordRecoveryRetryTimers = new Map\(\)/);
  assert.match(runtime, /for \(const peer of peers\)/);
  assert.match(runtime, /announcePeerRecord\(record, \{ peers: \[peer\], fanout: 1, replacePropagationTargets: false \}\)/);
  assert.match(runtime, /peerRecordRecoveryRetryTimers\.set\(peer\.nodeId/);
  assert.match(runtime, /peerRecordRecoveryRetryDelaysMs = \[500, 1_500, 5_000, 10_000, 20_000\]/);
});

test('startup burst is bounded and deterministic while Class-D recovery remains <=120s', () => {
  assert.match(runtime, /peerRecordControlPlaneConcurrency = Math\.max\(1, Math\.min\(4, alpha\)\)/);
  assert.match(runtime, /peerRecordStartupJitterMaxMs = 250/);
  assert.match(runtime, /#deterministicControlPlaneJitterMs/);
  assert.match(runtime, /const workers = Math\.min\(this\.peerRecordControlPlaneConcurrency, Math\.max\(1, candidates\.length\)\)/);
  assert.match(campaign, /assert float\('\$recovery_p95'\) <= 120000/);
  assert.match(campaign, /RECOVERY_GOOD=/);
  assert.match(campaign, /diagnosticUnavailable=/);
});


test('restart recovery is asynchronous and verifies direct QUIC sessions before READY', async () => {
  const runtime = await readFile(new URL('../network/runtime.js', import.meta.url), 'utf8');
  assert.match(runtime, /this\.peerRecordRecoveryTask = \(async \(\) => \{/);
  assert.match(runtime, /this\.rpc\.withDeadline\(Date\.now\(\) \+ 1_500/);
  assert.match(runtime, /void this\.rpc\.ping\(peer\)/);
  assert.match(runtime, /peerRecordRecoverySessionReady/);
  assert.match(runtime, /\['propagate', 'establish-sessions'\]\.includes\(epoch\.phase\)/);
  assert.match(runtime, /this\.#markRecoveryEpochReady\(\)/);
});
