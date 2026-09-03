import { createHash } from 'node:crypto';

export const RECOVERY_DRILL_PHASES = Object.freeze([
  'declare',
  'contain',
  'restore',
  'revalidate',
  'resume',
  'audit',
]);

export const RECOVERY_SCENARIOS = Object.freeze([
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

export const RECOVERY_OBJECTIVES = Object.freeze({
  'instance-loss': Object.freeze({
    rtoSeconds: 300,
    rpoSeconds: 300,
    backupClass: 'service-state',
    drillCadence: 'monthly',
    requiredRevalidation: Object.freeze(['identityContinuityVerified']),
  }),
  'regional-failure': Object.freeze({
    rtoSeconds: 1800,
    rpoSeconds: 900,
    backupClass: 'cross-failure-domain',
    drillCadence: 'semiannual',
    requiredRevalidation: Object.freeze(['regionalAuthorityVerified', 'routingRebuilt']),
  }),
  'durable-state-corruption': Object.freeze({
    rtoSeconds: 3600,
    rpoSeconds: 900,
    backupClass: 'authoritative-durable-state',
    drillCadence: 'quarterly',
    requiredRevalidation: Object.freeze(['signedStateRevalidated', 'corruptStateRejected']),
  }),
  'identity-key-loss': Object.freeze({
    rtoSeconds: 3600,
    rpoSeconds: 0,
    backupClass: 'protected-authority-or-succession',
    drillCadence: 'semiannual',
    requiredRevalidation: Object.freeze(['identityContinuityVerified', 'revokedIdentityRejected']),
  }),
  'semantic-index-corruption': Object.freeze({
    rtoSeconds: 3600,
    rpoSeconds: 0,
    backupClass: 'rebuild-from-canonical-source',
    drillCadence: 'quarterly',
    requiredRevalidation: Object.freeze(['canonicalSourceVerified', 'indexRebuiltOrVerified']),
  }),
  'provider-outage': Object.freeze({
    rtoSeconds: 900,
    rpoSeconds: 300,
    backupClass: 'provider-runtime-state',
    drillCadence: 'monthly',
    requiredRevalidation: Object.freeze(['providerAuthorityVerified', 'providerNegativePathVerified']),
  }),
  'relay-outage': Object.freeze({
    rtoSeconds: 300,
    rpoSeconds: 0,
    backupClass: 'stateless-redeploy',
    drillCadence: 'monthly',
    requiredRevalidation: Object.freeze(['relayPublicPathVerified', 'originBypassDenied']),
  }),
  'artifact-store-outage': Object.freeze({
    rtoSeconds: 1800,
    rpoSeconds: 900,
    backupClass: 'durable-artifacts',
    drillCadence: 'quarterly',
    requiredRevalidation: Object.freeze(['artifactIntegrityVerified', 'missingArtifactFailsClosed']),
  }),
  'entitlement-accounting-outage': Object.freeze({
    rtoSeconds: 1800,
    rpoSeconds: 300,
    backupClass: 'authoritative-accounting',
    drillCadence: 'quarterly',
    requiredRevalidation: Object.freeze(['accountingConsistencyVerified', 'ownerFundedAmbiguityFailsClosed']),
  }),
});

const FORBIDDEN_EVIDENCE_KEYS = /^(?:secret|password|token|privateKey|clientSecret|connectionString|accessKey|refreshToken)$/i;
const PRIVATE_KEY_PATTERN = /-----BEGIN [^-]*PRIVATE KEY-----/;
const SHA40 = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function auditDigest(previousDigest, event) {
  return createHash('sha256')
    .update(previousDigest ?? '')
    .update(JSON.stringify(canonicalize(event)))
    .digest('hex');
}

function assertSecretFree(value, path = 'evidence') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSecretFree(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      assert(!FORBIDDEN_EVIDENCE_KEYS.test(key), `${path}.${key} must not contain secret material`);
      assertSecretFree(nested, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === 'string') {
    assert(!PRIVATE_KEY_PATTERN.test(value), `${path} must not contain a private key`);
  }
}

function assertIsoTimestamp(value, label) {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)), `${label} must be an ISO timestamp`);
}

function assertEvidenceFlags(evidence, flags, phase) {
  for (const flag of flags) {
    assert(evidence?.[flag] === true, `${phase} requires ${flag}=true`);
  }
}

function requireRestoreProof(drill, evidence) {
  const objective = RECOVERY_OBJECTIVES[drill.scenario];
  assertEvidenceFlags(evidence, ['restoreSourceVerified', 'restoreCompleted'], 'restore');

  if (objective.backupClass === 'protected-authority-or-succession') {
    const digest = evidence.backupDigest ?? evidence.authorityEvidenceDigest;
    assert(typeof digest === 'string' && SHA256.test(digest), 'restore requires a SHA-256 backupDigest or authorityEvidenceDigest');
    return;
  }

  if (!['stateless-redeploy', 'rebuild-from-canonical-source'].includes(objective.backupClass)) {
    assert(typeof evidence.backupDigest === 'string' && SHA256.test(evidence.backupDigest), 'restore requires a SHA-256 backupDigest');
  }
}

function requireRevalidation(drill, evidence) {
  assertEvidenceFlags(
    evidence,
    ['integrityVerified', 'securityNegativeVerified', 'authorityVerified', 'corruptOrStaleStateRejected'],
    'revalidate',
  );
  assertEvidenceFlags(evidence, RECOVERY_OBJECTIVES[drill.scenario].requiredRevalidation, 'revalidate');
}

function requireAudit(drill, evidence) {
  const objective = RECOVERY_OBJECTIVES[drill.scenario];
  assertEvidenceFlags(evidence, ['evidencePersisted', 'ownerAcknowledged'], 'audit');
  assertIsoTimestamp(evidence.recoveryPointAt, 'recoveryPointAt');
  assert(Number.isFinite(evidence.observedRtoSeconds) && evidence.observedRtoSeconds >= 0, 'audit requires observedRtoSeconds');
  assert(Number.isFinite(evidence.observedRpoSeconds) && evidence.observedRpoSeconds >= 0, 'audit requires observedRpoSeconds');

  const resumeAt = drill.history.find((event) => event.phase === 'resume')?.at;
  assertIsoTimestamp(resumeAt, 'resume timestamp');
  const measuredRtoSeconds = Math.max(0, (Date.parse(resumeAt) - Date.parse(drill.startedAt)) / 1000);
  const measuredRpoSeconds = Math.max(0, (Date.parse(drill.startedAt) - Date.parse(evidence.recoveryPointAt)) / 1000);

  assert(Math.abs(evidence.observedRtoSeconds - measuredRtoSeconds) < 0.001, 'observedRtoSeconds must match drill timestamps');
  assert(Math.abs(evidence.observedRpoSeconds - measuredRpoSeconds) < 0.001, 'observedRpoSeconds must match recoveryPointAt');
  assert(measuredRtoSeconds <= objective.rtoSeconds, `RTO exceeded for ${drill.scenario}`);
  assert(measuredRpoSeconds <= objective.rpoSeconds, `RPO exceeded for ${drill.scenario}`);
}

export function recoveryObjectiveFor(scenario) {
  const objective = RECOVERY_OBJECTIVES[scenario];
  assert(objective, `unsupported recovery scenario: ${scenario}`);
  return objective;
}

export function createRecoveryDrill({ scenario, sourceSha, deploymentRef, startedAt = new Date().toISOString() }) {
  recoveryObjectiveFor(scenario);
  assert(typeof sourceSha === 'string' && SHA40.test(sourceSha), 'sourceSha must be a 40-character Git SHA');
  assert(typeof deploymentRef === 'string' && deploymentRef.trim().length > 0, 'deploymentRef is required');
  assertIsoTimestamp(startedAt, 'startedAt');
  assertSecretFree({ deploymentRef });

  const initialEvent = {
    phase: 'declare',
    at: startedAt,
    scenario,
    sourceSha,
    deploymentRef,
  };
  const digest = auditDigest(null, initialEvent);

  return {
    scenario,
    sourceSha,
    deploymentRef,
    startedAt,
    phase: 'declare',
    status: 'IN_PROGRESS',
    history: [{ ...initialEvent, digest }],
  };
}

export function advanceRecoveryDrill(drill, nextPhase, evidence = {}, at = new Date().toISOString()) {
  assert(drill && RECOVERY_SCENARIOS.includes(drill.scenario), 'valid drill is required');
  assertIsoTimestamp(at, 'at');
  assertSecretFree(evidence);

  const currentIndex = RECOVERY_DRILL_PHASES.indexOf(drill.phase);
  const nextIndex = RECOVERY_DRILL_PHASES.indexOf(nextPhase);
  assert(nextIndex === currentIndex + 1, `recovery phase must advance exactly one step after ${drill.phase}`);

  const previousAt = drill.history.at(-1)?.at;
  assertIsoTimestamp(previousAt, 'previous phase timestamp');
  assert(Date.parse(at) >= Date.parse(previousAt), 'recovery phase timestamps must be monotonic');

  if (nextPhase === 'contain') {
    assertEvidenceFlags(evidence, ['faultIsolated', 'newWritesProtected'], 'contain');
  } else if (nextPhase === 'restore') {
    requireRestoreProof(drill, evidence);
  } else if (nextPhase === 'revalidate') {
    requireRevalidation(drill, evidence);
  } else if (nextPhase === 'resume') {
    assertEvidenceFlags(evidence, ['serviceHealthy', 'syntheticProbePassed', 'noSafetyViolation'], 'resume');
  } else if (nextPhase === 'audit') {
    requireAudit(drill, evidence);
  }

  const previousDigest = drill.history.at(-1)?.digest ?? null;
  const event = { phase: nextPhase, at, evidence };
  const digest = auditDigest(previousDigest, event);

  return {
    ...drill,
    phase: nextPhase,
    status: nextPhase === 'audit' ? 'PASS' : 'IN_PROGRESS',
    history: [...drill.history, { ...event, digest }],
  };
}

export function validateRecoveryPolicy() {
  assert(Object.keys(RECOVERY_OBJECTIVES).length === RECOVERY_SCENARIOS.length, 'every recovery scenario needs an objective');
  for (const scenario of RECOVERY_SCENARIOS) {
    const objective = RECOVERY_OBJECTIVES[scenario];
    assert(Number.isInteger(objective.rtoSeconds) && objective.rtoSeconds > 0, `${scenario} requires positive RTO`);
    assert(Number.isInteger(objective.rpoSeconds) && objective.rpoSeconds >= 0, `${scenario} requires non-negative RPO`);
    assert(typeof objective.backupClass === 'string' && objective.backupClass.length > 0, `${scenario} requires backupClass`);
    assert(typeof objective.drillCadence === 'string' && objective.drillCadence.length > 0, `${scenario} requires drillCadence`);
    assert(Array.isArray(objective.requiredRevalidation) && objective.requiredRevalidation.length > 0, `${scenario} requires revalidation checks`);
  }
  return true;
}
