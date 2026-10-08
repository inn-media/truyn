import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateAzureClassD5000Evidence } from './class-d-5000-evidence.js';

const mandatoryStages = ['topology','readiness-barrier','convergence','pre-baseline-peer-freshness','baseline','healed-routing','resources','evidence'];
const fixture = (count, perHost) => ({
  class: 'D-5000',
  scope: '5000-real-process-scale+safety-contract-v2',
  testedCommit: '1234567890abcdef1234567890abcdef12345678',
  workflowRunId: '37852326390',
  readiness: { readyNodeCount: count, readyNodeRatio: 1 },
  stageResults: { overall: 'PASS', allPossibleStagesAttempted: true, stages: mandatoryStages.map((stage) => ({ stage, status: 'PASS' })) },
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
const readinessMissing = fixture(5000,250); delete readinessMissing.readiness;
assert.equal(evaluateAzureClassD5000Evidence(readinessMissing).checks.readinessAll5000, false);
assert.equal(evaluateAzureClassD5000Evidence(readinessMissing).passed, false);
const readinessIncomplete = fixture(5000,250); readinessIncomplete.readiness.readyNodeCount=4999;
assert.equal(evaluateAzureClassD5000Evidence(readinessIncomplete).passed, false);
const readinessFalseRatio = fixture(5000,250); readinessFalseRatio.readiness.readyNodeRatio=0.99;
assert.equal(evaluateAzureClassD5000Evidence(readinessFalseRatio).passed, false);
const stageMissing = fixture(5000,250); delete stageMissing.stageResults;
assert.equal(evaluateAzureClassD5000Evidence(stageMissing).passed, false);
const stageRed = fixture(5000,250); stageRed.stageResults.stages[1].status='RED';
assert.equal(evaluateAzureClassD5000Evidence(stageRed).passed, false);
const stageSkipped = fixture(5000,250); stageSkipped.stageResults.stages[1].status='SKIPPED_DEPENDENCY';
assert.equal(evaluateAzureClassD5000Evidence(stageSkipped).passed, false);
const stagePartial = fixture(5000,250); stagePartial.stageResults.allPossibleStagesAttempted=false;
assert.equal(evaluateAzureClassD5000Evidence(stagePartial).passed, false);
const wrongClass = fixture(5000,250); wrongClass.class='D-1000';
assert.equal(evaluateAzureClassD5000Evidence(wrongClass).passed, false);
const missingCommit = fixture(5000,250); delete missingCommit.testedCommit;
assert.equal(evaluateAzureClassD5000Evidence(missingCommit).passed, false);
const invalidRun = fixture(5000,250); invalidRun.workflowRunId='not-a-run';
assert.equal(evaluateAzureClassD5000Evidence(invalidRun).passed, false);
const wrongScope = fixture(5000,250); wrongScope.scope='1000-real-process-scale+safety-contract-v2';
assert.equal(evaluateAzureClassD5000Evidence(wrongScope).passed, false);

const tempDir = mkdtempSync(join(tmpdir(), 'truyn-d5000-terminal-'));
try {
  const evidencePath = join(tempDir, 'evidence.json');
  writeFileSync(evidencePath, JSON.stringify(fixture(5000,250)));
  const exactSha = '1234567890abcdef1234567890abcdef12345678';
  function terminal(overrides={}) {
    return spawnSync(process.execPath, ['benchmarks/scale/verify-class-d-5000-terminal.js', evidencePath], {
      encoding: 'utf8',
      env: { ...process.env, TESTED_COMMIT: exactSha, GITHUB_RUN_ID: '37852326390', ...overrides }
    });
  }
  const acceptedTerminal = terminal();
  assert.equal(acceptedTerminal.status, 0, acceptedTerminal.stdout + acceptedTerminal.stderr);
  assert.equal(JSON.parse(acceptedTerminal.stdout).ok, true);
  const wrongSource = terminal({TESTED_COMMIT: 'abcdef0123456789abcdef0123456789abcdef01'});
  assert.equal(wrongSource.status, 1);
  assert.ok(JSON.parse(wrongSource.stdout).failed.includes('exactSourceSha'));
  const wrongRun = terminal({GITHUB_RUN_ID: '37852326391'});
  assert.equal(wrongRun.status, 1);
  assert.ok(JSON.parse(wrongRun.stdout).failed.includes('exactRunId'));
  const missingExpectedSource = terminal({TESTED_COMMIT: ''});
  assert.equal(missingExpectedSource.status, 1);
  assert.ok(JSON.parse(missingExpectedSource.stdout).failed.includes('exactSourceSha'));
} finally {
  rmSync(tempDir, {recursive:true, force:true});
}
console.log('TRUYN_D5000_EVALUATOR_REGRESSION=PASS accepted_5000=true rejected_1000=true safety=true readiness=true full_stage_evidence=true source_contract=true source_identity=true');
