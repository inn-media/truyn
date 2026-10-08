import assert from 'node:assert/strict';
import { evaluateAzureClassD5000Evidence } from './class-d-5000-evidence.js';

const fixture = (count, perHost) => ({
  topology: {
    realProcessCount: count,
    realProcessesPerHost: perHost,
    uniqueIdentityCount: count,
    uniqueEndpointCount: count,
    syntheticNodeCount: 0,
    hostCount: 20
  },
  routing: { baselineSuccessRatio: 1, healedSuccessRatio: 1 },
  convergence: { latencyMs: { p95: 119999 } },
  recovery: { latencyMs: { p95: 119999 } },
  adversarial: { packetPartition: { exercised: true, realPacketPath: true, probeCount: 20, blockedSuccesses: 0 } },
  safety: {
    acknowledgedWriteLossCount: 0, invalidSignedStateAcceptedCount: 0,
    staleRevokedReceiptAcceptedCount: 0, unauthorizedProviderExecutionCount: 0,
    probes: {
      invalidSignedState: { remoteQuicControl: true, targetRejected: true, validRecordAcks: 2, rejectionReason: 'invalid_dht_record:dht_record_signature' },
      staleReceipt: { exactCommitLocalVerifier: true, reason: 'trust_receipt_v2_lifecycle_head_stale' },
      providerAuthorization: { exactCommitAdapterHost: true, accessDenied: true, adapterExecutions: 0 }
    }
  },
  cleanup: { confirmed: true, remainingResources: 0 }
});
const accepted = evaluateAzureClassD5000Evidence(fixture(5000, 250));
assert.equal(accepted.passed, true, JSON.stringify(accepted.failed));
assert.equal(accepted.class, 'D-5000');
assert.equal(accepted.thresholds.nodeCount, 5000);
assert.equal(accepted.thresholds.nodesPerHost, 250);
const rejected = evaluateAzureClassD5000Evidence(fixture(1000, 50));
assert.equal(rejected.passed, false);
for (const check of ['realNodes','distinctIdentities','distinctQuicSockets','strictNodesPerHost']) {
  assert.equal(rejected.checks[check], false, check);
}
const weakRouting = fixture(5000,250); weakRouting.routing.baselineSuccessRatio=0.989;
assert.equal(evaluateAzureClassD5000Evidence(weakRouting).passed, false);
const loss = fixture(5000,250); loss.safety.acknowledgedWriteLossCount=1;
assert.equal(evaluateAzureClassD5000Evidence(loss).passed, false);
const safety = fixture(5000,250); safety.safety.probes.invalidSignedState.targetRejected=false;
assert.equal(evaluateAzureClassD5000Evidence(safety).passed, false);
const cleanup = fixture(5000,250); cleanup.cleanup.remainingResources=1;
assert.equal(evaluateAzureClassD5000Evidence(cleanup).passed, false);
console.log('TRUYN_D5000_EVALUATOR_REGRESSION=PASS accepted_5000=true rejected_1000=true safety=true');
