#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';

const config = JSON.parse(fs.readFileSync('config/class-d-recovery-invariants.json', 'utf8'));
const runtime = fs.readFileSync('network/runtime.js', 'utf8');
const service = fs.readFileSync('network/testnet/node-service.js', 'utf8');
const campaign = fs.readFileSync('benchmarks/scale/class-d-azure-1000-campaign.sh', 'utf8');
const contractTest = fs.readFileSync('tests/d200-recovery-control-plane.test.js', 'utf8');
const restartTest = fs.readFileSync('tests/peer-record-restart-propagation-readiness.test.js', 'utf8');

assert.equal(config.schema, 'truyn.class-d.recovery-invariants.v1');
assert.deepEqual(config.classes, [200, 500, 1000]);
assert.equal(config.recoveryP95MaxMs, 120000, 'Class-D recovery ceiling is immutable at 120s');
assert.equal(config.startupMustNotBlockOnRecovery, true);
assert.equal(config.failClosedReadiness, true);
assert.equal(config.preserveSameRecordAcks, true);
assert.equal(config.republishPendingOnly, true);
assert.equal(config.directQuicBeforeReady, true);
assert.equal(config.perPeerRetries, true);
assert.equal(config.boundedControlPlaneConcurrency, true);
assert.equal(config.deterministicStartupJitter, true);
assert.deepEqual(config.recoveryPhases, ['hydrate', 'routing-refresh', 'placement', 'propagate', 'establish-sessions', 'ready']);
assert.deepEqual(config.requiredDiagnostics, [
  'targetSetChanges', 'ackPreserved', 'ackReset', 'propagationAttempts',
  'rpcTimeouts', 'pendingAgeMs', 'routingRefreshMs', 'quicReplacementMs'
]);
assert.equal(config.policy?.noSilentRemoval, true);
assert.equal(config.policy?.noAcceptanceWeakening, true);
assert.equal(config.policy?.fivePatchContractRemainsIndependent, true);

for (const diagnostic of config.requiredDiagnostics) {
  assert.match(runtime, new RegExp(`\\b${diagnostic}\\b`), `runtime lost recovery diagnostic ${diagnostic}`);
}
for (const phase of config.recoveryPhases.slice(1)) {
  assert.ok(runtime.includes(`RecoveryEpochPhase('${phase}')`) || runtime.includes(`phase = '${phase}'`) || runtime.includes(`phase !== '${phase}'`) || runtime.includes(`phase === '${phase}'`), `runtime lost recovery phase ${phase}`);
}
assert.ok(runtime.includes("epoch.phase = 'hydrate'"), 'restart must open the hydrate phase');
assert.ok(runtime.includes('const sameRecord = previous.recordId === record?.recordId'), 'same-record ACK preservation contract missing');
assert.ok(runtime.includes('acknowledgedNodeIds = sameRecord'), 'same-record ACKs must be preserved');
assert.ok(runtime.includes('pendingNodeIds = targetNodeIds.filter'), 'only pending placements may require republish');
assert.ok(runtime.includes('this.peerRecordLifecycle.recoveryEpoch.active !== true'), 'readiness must fail closed while recovery epoch is active');
assert.ok(runtime.includes('void this.rpc.ping(peer)'), 'READY must be gated by a real direct QUIC RPC ping');
assert.ok(runtime.includes('this.peerRecordRecoveryRetryTimers = new Map()'), 'per-peer retry state missing');
assert.ok(runtime.includes('this.peerRecordControlPlaneConcurrency'), 'bounded control-plane concurrency missing');
assert.ok(runtime.includes('#deterministicControlPlaneJitterMs'), 'deterministic startup jitter missing');
assert.ok(runtime.includes('this.peerRecordRecoveryTask = (async () =>'), 'restart recovery must run asynchronously');
assert.ok(runtime.includes('Date.now() + 1_500'), 'recovery routing refresh must remain bounded');

assert.ok(campaign.includes("assert float('$recovery_p95') <= 120000"), 'campaign recovery p95 threshold was weakened or removed');
assert.ok(campaign.includes('stage=restart-recovery'), 'restart-recovery acceptance stage missing');
assert.ok(service.includes('recoveryDiagnostics: lifecycle.diagnostics || {}'), 'testnet readiness must expose recovery diagnostics');
assert.ok(service.includes('recoveryEpoch: lifecycle.recoveryEpoch || null'), 'testnet readiness must expose recovery epoch');
assert.ok(contractTest.includes('restart recovery is asynchronous and verifies direct QUIC sessions before READY'), 'direct-QUIC recovery regression contract missing');
assert.ok(restartTest.includes("process startup must not block on network recovery epoch"), 'non-blocking startup regression contract missing');
assert.ok(restartTest.includes("process liveness must not imply network readiness"), 'fail-closed startup regression contract missing');

console.log(`TRUYN_CLASS_D_RECOVERY_INVARIANTS=PASS classes=D-200,D-500,D-1000 recovery_p95_max_ms=${config.recoveryP95MaxMs} diagnostics=${config.requiredDiagnostics.length} fail_closed=true direct_quic=true no_silent_removal=true`);
