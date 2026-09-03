import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECOVERY_DRILL_PHASES,
  RECOVERY_OBJECTIVES,
  RECOVERY_SCENARIOS,
  advanceRecoveryDrill,
  createRecoveryDrill,
  recoveryObjectiveFor,
  validateRecoveryPolicy,
} from '../operations/recovery-dr.js';

const SOURCE_SHA = '52f87c219cf4a6def04dcec18ccc40a97138a8da';
const BACKUP_DIGEST = 'a'.repeat(64);
const PRIVATE_KEY_MARKER = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');

function relayDrill() {
  let drill = createRecoveryDrill({
    scenario: 'relay-outage',
    sourceSha: SOURCE_SHA,
    deploymentRef: 'prod-relay:opaque-deployment-ref',
    startedAt: '2026-09-03T19:00:00.000Z',
  });
  drill = advanceRecoveryDrill(drill, 'contain', { faultIsolated: true, newWritesProtected: true }, '2026-09-03T19:00:10.000Z');
  drill = advanceRecoveryDrill(drill, 'restore', { restoreSourceVerified: true, restoreCompleted: true }, '2026-09-03T19:01:00.000Z');
  drill = advanceRecoveryDrill(drill, 'revalidate', {
    integrityVerified: true,
    securityNegativeVerified: true,
    authorityVerified: true,
    corruptOrStaleStateRejected: true,
    relayPublicPathVerified: true,
    originBypassDenied: true,
  }, '2026-09-03T19:01:30.000Z');
  drill = advanceRecoveryDrill(drill, 'resume', {
    serviceHealthy: true,
    syntheticProbePassed: true,
    noSafetyViolation: true,
  }, '2026-09-03T19:01:40.000Z');
  return drill;
}

test('production recovery policy covers every required P1 failure class', () => {
  assert.equal(validateRecoveryPolicy(), true);
  assert.deepEqual(RECOVERY_DRILL_PHASES, ['declare', 'contain', 'restore', 'revalidate', 'resume', 'audit']);
  assert.deepEqual(RECOVERY_SCENARIOS, [
    'instance-loss',
    'regional-failure',
    'durable-state-corruption',
    'identity-key-loss',
    'semantic-index-corruption',
    'provider-outage',
    'relay-outage',
    'artifact-store-outage',
    'entitlement-accounting-outage',
  ]);
});

test('recovery objectives are numerical and scenario-specific', () => {
  assert.deepEqual(recoveryObjectiveFor('relay-outage'), RECOVERY_OBJECTIVES['relay-outage']);
  assert.equal(RECOVERY_OBJECTIVES['relay-outage'].rtoSeconds, 300);
  assert.equal(RECOVERY_OBJECTIVES['relay-outage'].rpoSeconds, 0);
  assert.equal(RECOVERY_OBJECTIVES['regional-failure'].rtoSeconds, 1800);
  assert.equal(RECOVERY_OBJECTIVES['regional-failure'].rpoSeconds, 900);
  assert.equal(RECOVERY_OBJECTIVES['entitlement-accounting-outage'].rpoSeconds, 300);
  assert.equal(RECOVERY_OBJECTIVES['identity-key-loss'].rpoSeconds, 0);
});

test('restore drill cannot skip lifecycle phases or move time backwards', () => {
  let drill = createRecoveryDrill({
    scenario: 'relay-outage',
    sourceSha: SOURCE_SHA,
    deploymentRef: 'prod-relay:opaque',
    startedAt: '2026-09-03T19:00:00.000Z',
  });
  assert.throws(
    () => advanceRecoveryDrill(drill, 'restore', { restoreSourceVerified: true, restoreCompleted: true }),
    /advance exactly one step/,
  );
  assert.throws(
    () => advanceRecoveryDrill(drill, 'contain', { faultIsolated: true, newWritesProtected: true }, '2026-09-03T18:59:59.000Z'),
    /timestamps must be monotonic/,
  );
});

test('durable restore requires an integrity-bound backup reference', () => {
  let drill = createRecoveryDrill({
    scenario: 'artifact-store-outage',
    sourceSha: SOURCE_SHA,
    deploymentRef: 'artifact-store:opaque',
  });
  drill = advanceRecoveryDrill(drill, 'contain', { faultIsolated: true, newWritesProtected: true });
  assert.throws(
    () => advanceRecoveryDrill(drill, 'restore', { restoreSourceVerified: true, restoreCompleted: true }),
    /backupDigest/,
  );
  assert.doesNotThrow(() => advanceRecoveryDrill(drill, 'restore', {
    restoreSourceVerified: true,
    restoreCompleted: true,
    backupDigest: BACKUP_DIGEST,
  }));
});

test('identity/key restore accepts protected authority/succession evidence instead of forcing a raw backup', () => {
  let drill = createRecoveryDrill({
    scenario: 'identity-key-loss',
    sourceSha: SOURCE_SHA,
    deploymentRef: 'node-identity:opaque',
  });
  drill = advanceRecoveryDrill(drill, 'contain', { faultIsolated: true, newWritesProtected: true });
  assert.doesNotThrow(() => advanceRecoveryDrill(drill, 'restore', {
    restoreSourceVerified: true,
    restoreCompleted: true,
    authorityEvidenceDigest: BACKUP_DIGEST,
  }));
});

test('entitlement/accounting recovery requires fail-closed correctness proof', () => {
  let drill = createRecoveryDrill({
    scenario: 'entitlement-accounting-outage',
    sourceSha: SOURCE_SHA,
    deploymentRef: 'billing:opaque',
  });
  drill = advanceRecoveryDrill(drill, 'contain', { faultIsolated: true, newWritesProtected: true });
  drill = advanceRecoveryDrill(drill, 'restore', {
    restoreSourceVerified: true,
    restoreCompleted: true,
    backupDigest: BACKUP_DIGEST,
  });
  assert.throws(() => advanceRecoveryDrill(drill, 'revalidate', {
    integrityVerified: true,
    securityNegativeVerified: true,
    authorityVerified: true,
    corruptOrStaleStateRejected: true,
    accountingConsistencyVerified: true,
  }), /ownerFundedAmbiguityFailsClosed/);
});

test('identity/key loss recovery requires continuity and revoked identity rejection', () => {
  let drill = createRecoveryDrill({
    scenario: 'identity-key-loss',
    sourceSha: SOURCE_SHA,
    deploymentRef: 'node-identity:opaque',
  });
  drill = advanceRecoveryDrill(drill, 'contain', { faultIsolated: true, newWritesProtected: true });
  drill = advanceRecoveryDrill(drill, 'restore', {
    restoreSourceVerified: true,
    restoreCompleted: true,
    authorityEvidenceDigest: BACKUP_DIGEST,
  });
  assert.throws(() => advanceRecoveryDrill(drill, 'revalidate', {
    integrityVerified: true,
    securityNegativeVerified: true,
    authorityVerified: true,
    corruptOrStaleStateRejected: true,
    identityContinuityVerified: true,
  }), /revokedIdentityRejected/);
});

test('successful restore drill derives bounded RTO/RPO from timestamps and records hash-chained audit', () => {
  let drill = relayDrill();
  drill = advanceRecoveryDrill(drill, 'audit', {
    evidencePersisted: true,
    ownerAcknowledged: true,
    recoveryPointAt: '2026-09-03T19:00:00.000Z',
    observedRtoSeconds: 100,
    observedRpoSeconds: 0,
  }, '2026-09-03T19:02:00.000Z');
  assert.equal(drill.status, 'PASS');
  assert.equal(drill.phase, 'audit');
  assert.equal(drill.history.length, 6);
  for (const event of drill.history) assert.match(event.digest, /^[0-9a-f]{64}$/);
  assert.equal(new Set(drill.history.map((event) => event.digest)).size, drill.history.length);
});

test('audit rejects manufactured RTO/RPO values that disagree with drill timestamps', () => {
  const drill = relayDrill();
  assert.throws(() => advanceRecoveryDrill(drill, 'audit', {
    evidencePersisted: true,
    ownerAcknowledged: true,
    recoveryPointAt: '2026-09-03T19:00:00.000Z',
    observedRtoSeconds: 99,
    observedRpoSeconds: 0,
  }), /observedRtoSeconds must match/);
  assert.throws(() => advanceRecoveryDrill(drill, 'audit', {
    evidencePersisted: true,
    ownerAcknowledged: true,
    recoveryPointAt: '2026-09-03T18:59:59.000Z',
    observedRtoSeconds: 100,
    observedRpoSeconds: 0,
  }), /observedRpoSeconds must match/);
});

test('restore drill fails when measured RTO or RPO exceeds the contract', () => {
  let slow = createRecoveryDrill({
    scenario: 'relay-outage',
    sourceSha: SOURCE_SHA,
    deploymentRef: 'relay:slow',
    startedAt: '2026-09-03T19:00:00.000Z',
  });
  slow = advanceRecoveryDrill(slow, 'contain', { faultIsolated: true, newWritesProtected: true }, '2026-09-03T19:00:10.000Z');
  slow = advanceRecoveryDrill(slow, 'restore', { restoreSourceVerified: true, restoreCompleted: true }, '2026-09-03T19:01:00.000Z');
  slow = advanceRecoveryDrill(slow, 'revalidate', {
    integrityVerified: true,
    securityNegativeVerified: true,
    authorityVerified: true,
    corruptOrStaleStateRejected: true,
    relayPublicPathVerified: true,
    originBypassDenied: true,
  }, '2026-09-03T19:02:00.000Z');
  slow = advanceRecoveryDrill(slow, 'resume', { serviceHealthy: true, syntheticProbePassed: true, noSafetyViolation: true }, '2026-09-03T19:05:01.000Z');
  assert.throws(() => advanceRecoveryDrill(slow, 'audit', {
    evidencePersisted: true,
    ownerAcknowledged: true,
    recoveryPointAt: '2026-09-03T19:00:00.000Z',
    observedRtoSeconds: 301,
    observedRpoSeconds: 0,
  }, '2026-09-03T19:05:02.000Z'), /RTO exceeded/);

  const normal = relayDrill();
  assert.throws(() => advanceRecoveryDrill(normal, 'audit', {
    evidencePersisted: true,
    ownerAcknowledged: true,
    recoveryPointAt: '2026-09-03T18:59:59.000Z',
    observedRtoSeconds: 100,
    observedRpoSeconds: 1,
  }, '2026-09-03T19:02:00.000Z'), /RPO exceeded/);
});

test('public restore evidence rejects secret-bearing fields and private keys', () => {
  const drill = createRecoveryDrill({
    scenario: 'relay-outage',
    sourceSha: SOURCE_SHA,
    deploymentRef: 'prod-relay:opaque',
  });
  assert.throws(() => advanceRecoveryDrill(drill, 'contain', {
    faultIsolated: true,
    newWritesProtected: true,
    token: 'must-not-appear',
  }), /secret material/);
  assert.throws(() => advanceRecoveryDrill(drill, 'contain', {
    faultIsolated: true,
    newWritesProtected: true,
    note: PRIVATE_KEY_MARKER,
  }), /private key/);
});

test('unsupported recovery scenarios cannot manufacture evidence', () => {
  assert.throws(() => recoveryObjectiveFor('peer-churn-is-not-dr'), /unsupported recovery scenario/);
});
