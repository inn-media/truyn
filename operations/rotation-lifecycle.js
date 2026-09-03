import { createHash } from 'node:crypto';

export const ROTATION_RESOURCE_CLASSES = Object.freeze([
  'origin-proof',
  'provider-m2m-proof',
  'entitlement-signing-key',
  'cloud-workload-identity',
  'deployment-credential',
  'node-identity',
  'bootstrap-trust-record',
]);

export const ROTATION_PHASES = Object.freeze([
  'create',
  'overlap',
  'cutover',
  'verify',
  'revoke-old',
  'audit',
]);

const NEXT_PHASE = new Map(ROTATION_PHASES.map((phase, index) => [phase, ROTATION_PHASES[index + 1] ?? null]));

function assertNonEmpty(name, value) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required`);
  return value.trim();
}

function assertSafeReference(name, value) {
  const text = assertNonEmpty(name, value);
  const lower = text.toLowerCase();
  if (/bearer\s|private[_-]?key|secret=|token=|password=|api[_-]?key=/.test(lower)) {
    throw new Error(`${name} must be a sanitized non-secret reference`);
  }
  return text;
}

function digest(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function publicId(value) {
  return `sha256:${digest(value).slice(0, 24)}`;
}

function eventDigest(event, previousDigest = null) {
  return digest(JSON.stringify({ previousDigest, ...event }));
}

export function createRotationPlan({
  resourceClass,
  scope,
  oldVersion,
  newVersion,
  actor,
  reason = 'scheduled',
  mode = 'standard',
  now = () => new Date(),
} = {}) {
  if (!ROTATION_RESOURCE_CLASSES.includes(resourceClass)) throw new Error(`unsupported rotation resource class: ${resourceClass}`);
  if (!['standard', 'emergency'].includes(mode)) throw new Error(`unsupported rotation mode: ${mode}`);
  const safeScope = assertNonEmpty('scope', scope);
  const oldId = assertNonEmpty('oldVersion', oldVersion);
  const newId = assertNonEmpty('newVersion', newVersion);
  if (oldId === newId) throw new Error('oldVersion and newVersion must differ');
  const safeActor = assertNonEmpty('actor', actor);
  const safeReason = assertNonEmpty('reason', reason);

  const event = {
    phase: 'create',
    at: now().toISOString(),
    resourceClass,
    scopeId: publicId(safeScope),
    oldVersionId: publicId(oldId),
    newVersionId: publicId(newId),
    actorId: publicId(safeActor),
    reason: safeReason,
    mode,
  };
  const chainDigest = eventDigest(event);
  return Object.freeze({
    resourceClass,
    scopeId: event.scopeId,
    oldVersionId: event.oldVersionId,
    newVersionId: event.newVersionId,
    mode,
    phase: 'create',
    complete: false,
    chainDigest,
    history: Object.freeze([{ ...event, chainDigest }]),
  });
}

function requireChecks(phase, checks, mode) {
  const required = {
    overlap: mode === 'emergency'
      ? ['newMaterialStaged', 'oldMaterialFenced', 'rollbackOrRecoveryReady']
      : ['newMaterialStaged', 'oldMaterialStillValid', 'rollbackOrRecoveryReady'],
    cutover: ['newMaterialPrimary', 'dependentSystemsUpdated'],
    verify: ['positivePathPassed', 'negativePathPassed', 'continuityPassed'],
    'revoke-old': ['oldMaterialRevoked', 'oldMaterialRejected'],
    audit: ['evidenceRecorded', 'secretFreeEvidence'],
  }[phase] ?? [];

  for (const key of required) {
    if (checks?.[key] !== true) throw new Error(`${phase} requires ${key}=true`);
  }
}

export function advanceRotation(plan, {
  phase,
  actor,
  evidenceRef,
  checks = {},
  now = () => new Date(),
} = {}) {
  if (!plan || !ROTATION_RESOURCE_CLASSES.includes(plan.resourceClass)) throw new Error('valid rotation plan is required');
  if (plan.complete) throw new Error('rotation is already complete');
  const expected = NEXT_PHASE.get(plan.phase);
  if (phase !== expected) throw new Error(`invalid rotation transition: expected ${expected}, got ${phase}`);
  requireChecks(phase, checks, plan.mode);
  const safeActor = assertNonEmpty('actor', actor);
  const safeEvidence = assertSafeReference('evidenceRef', evidenceRef);

  const event = {
    phase,
    at: now().toISOString(),
    resourceClass: plan.resourceClass,
    scopeId: plan.scopeId,
    oldVersionId: plan.oldVersionId,
    newVersionId: plan.newVersionId,
    actorId: publicId(safeActor),
    evidenceRef: safeEvidence,
    checks: Object.freeze({ ...checks }),
  };
  const chainDigest = eventDigest(event, plan.chainDigest);
  const complete = phase === 'audit';
  return Object.freeze({
    ...plan,
    phase,
    complete,
    chainDigest,
    history: Object.freeze([...plan.history, { ...event, chainDigest }]),
  });
}

export function assertRotationComplete(plan) {
  if (!plan?.complete || plan.phase !== 'audit') throw new Error('rotation has not completed create -> overlap -> cutover -> verify -> revoke-old -> audit');
  if (plan.history.length !== ROTATION_PHASES.length) throw new Error('rotation audit history is incomplete');
  ROTATION_PHASES.forEach((phase, index) => {
    if (plan.history[index]?.phase !== phase) throw new Error(`rotation audit phase ${index} must be ${phase}`);
  });
  return true;
}
