import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROTATION_RESOURCE_CLASSES,
  ROTATION_PHASES,
  createRotationPlan,
  advanceRotation,
  assertRotationComplete,
} from '../operations/rotation-lifecycle.js';

const expectedClasses = [
  'origin-proof',
  'provider-m2m-proof',
  'entitlement-signing-key',
  'cloud-workload-identity',
  'deployment-credential',
  'node-identity',
  'bootstrap-trust-record',
];

test('rotation policy covers every P1 security rotation class', () => {
  assert.deepEqual([...ROTATION_RESOURCE_CLASSES], expectedClasses);
  assert.deepEqual([...ROTATION_PHASES], ['create', 'overlap', 'cutover', 'verify', 'revoke-old', 'audit']);
});

for (const resourceClass of expectedClasses) {
  test(`${resourceClass} completes only through the canonical six-phase lifecycle`, () => {
    let plan = createRotationPlan({ resourceClass, scope: 'production/example', oldVersion: 'v1', newVersion: 'v2', actor: 'operator-a' });
    plan = advanceRotation(plan, { phase: 'overlap', actor: 'operator-a', evidenceRef: 'ops://rotation/overlap', checks: { newMaterialStaged: true, oldMaterialStillValid: true, rollbackOrRecoveryReady: true } });
    plan = advanceRotation(plan, { phase: 'cutover', actor: 'operator-a', evidenceRef: 'ops://rotation/cutover', checks: { newMaterialPrimary: true, dependentSystemsUpdated: true } });
    plan = advanceRotation(plan, { phase: 'verify', actor: 'operator-b', evidenceRef: 'ops://rotation/verify', checks: { positivePathPassed: true, negativePathPassed: true, continuityPassed: true } });
    plan = advanceRotation(plan, { phase: 'revoke-old', actor: 'operator-b', evidenceRef: 'ops://rotation/revoke', checks: { oldMaterialRevoked: true, oldMaterialRejected: true } });
    plan = advanceRotation(plan, { phase: 'audit', actor: 'operator-b', evidenceRef: 'ops://rotation/audit', checks: { evidenceRecorded: true, secretFreeEvidence: true } });
    assert.equal(plan.complete, true);
    assert.equal(assertRotationComplete(plan), true);
    assert.equal(plan.history.length, 6);
    assert.match(plan.scopeId, /^sha256:/);
    assert.notEqual(plan.oldVersionId, 'v1');
  });
}

test('rotation cannot skip overlap or revoke verification', () => {
  const plan = createRotationPlan({ resourceClass: 'origin-proof', scope: 'prod', oldVersion: 'v1', newVersion: 'v2', actor: 'operator-a' });
  assert.throws(() => advanceRotation(plan, { phase: 'cutover', actor: 'operator-a', evidenceRef: 'ops://cutover', checks: { newMaterialPrimary: true, dependentSystemsUpdated: true } }), /expected overlap/);
});

test('emergency rotation records overlap phase while fencing compromised old material', () => {
  let plan = createRotationPlan({ resourceClass: 'deployment-credential', scope: 'prod', oldVersion: 'compromised', newVersion: 'replacement', actor: 'operator-a', mode: 'emergency' });
  plan = advanceRotation(plan, { phase: 'overlap', actor: 'operator-a', evidenceRef: 'ops://emergency/stage', checks: { newMaterialStaged: true, oldMaterialFenced: true, rollbackOrRecoveryReady: true } });
  assert.equal(plan.phase, 'overlap');
});

test('rotation rejects secret-like public evidence references', () => {
  const plan = createRotationPlan({ resourceClass: 'provider-m2m-proof', scope: 'prod', oldVersion: 'v1', newVersion: 'v2', actor: 'operator-a' });
  assert.throws(() => advanceRotation(plan, { phase: 'overlap', actor: 'operator-a', evidenceRef: 'token=do-not-log', checks: { newMaterialStaged: true, oldMaterialStillValid: true, rollbackOrRecoveryReady: true } }), /sanitized non-secret reference/);
});
