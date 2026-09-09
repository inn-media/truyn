import { assessActiveTrust } from '../trust/lifecycle.js';

export const OPERATIONAL_REVOCATION_KINDS = Object.freeze([
  'membership',
  'provider-grant',
  'entitlement',
  'provider',
  'authority',
  'delegation',
  'trust-evidence'
]);

const KIND_SET = new Set(OPERATIONAL_REVOCATION_KINDS);
const AUTHORITY_TARGET_KINDS = new Set(['authority-root', 'authority-key']);

function requiredString(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function normalizedKind(value) {
  const kind = requiredString(value, 'operational revocation kind').toLowerCase();
  if (!KIND_SET.has(kind)) throw new Error(`Unsupported operational revocation kind: ${value}`);
  return kind;
}

function targetKindFor(kind, requestedTargetKind = null) {
  if (kind === 'provider-grant') return 'grant';
  if (kind === 'delegation') return 'authority-certificate';
  if (kind === 'authority') {
    const targetKind = requiredString(requestedTargetKind, 'authority targetKind').toLowerCase();
    if (!AUTHORITY_TARGET_KINDS.has(targetKind)) throw new Error(`Unsupported authority targetKind: ${requestedTargetKind}`);
    return targetKind;
  }
  if (kind === 'trust-evidence') return 'trust-evidence';
  return kind;
}

function normalizedActor(actor = {}) {
  return Object.freeze({
    authorityId: requiredString(actor.authorityId, 'revocation actor authorityId'),
    keyId: requiredString(actor.keyId, 'revocation actor keyId')
  });
}

function normalizedScope(scope) {
  if (scope == null) return null;
  if (typeof scope !== 'object' || Array.isArray(scope)) throw new Error('operational revocation scope must be an object or null');
  return structuredClone(scope);
}

function policyError(code, details = null) {
  const error = new Error(code);
  error.code = code;
  if (details != null) error.details = details;
  return error;
}

export function createOperationalRevocationController({
  revocationAuthority,
  authorize,
  validateTarget
} = {}) {
  if (!revocationAuthority || typeof revocationAuthority.revokeWithEvent !== 'function' || typeof revocationAuthority.exportEvents !== 'function') {
    throw new Error('operational revocation controller requires ProductionRevocationAuthority');
  }

  function issue({
    kind,
    targetId,
    targetKind = null,
    actor,
    scope = null,
    reasonClass = 'revoked_by_authority',
    emergency = false,
    effectiveAt = null
  } = {}) {
    const operationalKind = normalizedKind(kind);
    const id = requiredString(targetId, 'operational revocation targetId');
    const canonicalTargetKind = targetKindFor(operationalKind, targetKind);
    const authorityActor = normalizedActor(actor);
    const canonicalScope = normalizedScope(scope);
    const reason = requiredString(reasonClass, 'operational revocation reasonClass');

    if (typeof authorize !== 'function') throw policyError('operational_revocation_authorizer_required');
    const authorization = authorize({
      action: 'revoke',
      kind: operationalKind,
      targetKind: canonicalTargetKind,
      targetId: id,
      actor: authorityActor,
      scope: canonicalScope,
      emergency: Boolean(emergency)
    });
    if (!authorization || authorization.ok !== true) {
      throw policyError('operational_revocation_actor_denied', authorization?.reason || null);
    }

    if (typeof validateTarget !== 'function') throw policyError('operational_revocation_target_validator_required');
    const applicability = validateTarget({
      kind: operationalKind,
      targetKind: canonicalTargetKind,
      targetId: id,
      actor: authorityActor,
      scope: canonicalScope,
      emergency: Boolean(emergency)
    });
    if (!applicability || applicability.ok !== true) {
      throw policyError('operational_revocation_target_not_applicable', applicability?.reason || null);
    }

    const result = revocationAuthority.revokeWithEvent(canonicalTargetKind, id, {
      reason,
      scope: canonicalScope,
      operationalKind,
      emergency,
      effectiveAt,
      issuerAuthorityId: authorityActor.authorityId,
      issuerKeyId: authorityActor.keyId,
      metadata: { operationalKind }
    });
    return Object.freeze({
      created: Boolean(result.created),
      record: structuredClone(result.record),
      event: structuredClone(result.event)
    });
  }

  return Object.freeze({
    kinds: OPERATIONAL_REVOCATION_KINDS,
    issue,
    exportEvents: (options) => revocationAuthority.exportEvents(options),
    head: () => revocationAuthority.head()
  });
}

export function createRevocationDecisionCache({ revocationAuthority, onInvalidate = null } = {}) {
  if (!revocationAuthority || typeof revocationAuthority.epochFor !== 'function' || typeof revocationAuthority.subscribe !== 'function') {
    throw new Error('revocation decision cache requires a revocation authority with epochs and notifications');
  }
  const entries = new Map();
  let invalidations = 0;

  const unsubscribe = revocationAuthority.subscribe((event, context = {}) => {
    for (const [key, entry] of entries) {
      if (entry.kind !== event.kind) continue;
      if (entry.targetId && entry.targetId !== event.targetId) continue;
      entries.delete(key);
    }
    invalidations += 1;
    if (typeof onInvalidate === 'function') onInvalidate({ event, context, invalidations });
  });

  function decide({ kind, targetId = null, cacheKey, evaluate } = {}) {
    const operationalKind = normalizedKind(kind);
    const key = requiredString(cacheKey, 'revocation cacheKey');
    if (typeof evaluate !== 'function') throw new Error('revocation decision evaluate function is required');
    const epoch = revocationAuthority.epochFor(operationalKind);
    const existing = entries.get(key);
    if (existing && existing.kindEpoch === epoch.kind && existing.kind === operationalKind) {
      return { decision: structuredClone(existing.decision), cacheHit: true, epoch };
    }
    const decision = evaluate();
    entries.set(key, {
      kind: operationalKind,
      targetId: targetId == null ? null : String(targetId),
      kindEpoch: epoch.kind,
      decision: structuredClone(decision)
    });
    return { decision: structuredClone(decision), cacheHit: false, epoch };
  }

  return Object.freeze({
    decide,
    clear() { entries.clear(); },
    close() { unsubscribe(); entries.clear(); },
    snapshot() { return { size: entries.size, invalidations }; }
  });
}

export function createBoundedRevocationReplication({ sourceAuthority, replicas = [], nowMs = () => Date.now() } = {}) {
  if (!sourceAuthority || typeof sourceAuthority.exportEvents !== 'function') throw new Error('revocation replication requires sourceAuthority');
  const replicaMap = new Map();
  const partitioned = new Set();
  const timings = new Map();

  for (const descriptor of replicas) {
    const id = requiredString(descriptor?.id, 'revocation replica id');
    const authority = descriptor?.authority;
    if (!authority || authority.replicaMode !== true || typeof authority.applyReplicatedEvents !== 'function' || typeof authority.head !== 'function') {
      throw new Error(`revocation replica ${id} must be a read-only ProductionRevocationAuthority replica`);
    }
    if (replicaMap.has(id)) throw new Error(`duplicate revocation replica id: ${id}`);
    replicaMap.set(id, authority);
  }

  function timingKey(replicaId, eventId) {
    return `${replicaId}:${eventId}`;
  }

  function timingFor(replicaId, event) {
    const key = timingKey(replicaId, event.eventId);
    const current = timings.get(key) || {
      replicaId,
      eventId: event.eventId,
      kind: event.kind,
      durableAppendedAt: event.issuedAt,
      replicaAppliedAt: null,
      cacheInvalidatedAt: null,
      firstDeniedAt: null
    };
    timings.set(key, current);
    return current;
  }

  function replicate(replicaId) {
    const id = requiredString(replicaId, 'revocation replica id');
    const replica = replicaMap.get(id);
    if (!replica) throw new Error(`unknown revocation replica: ${id}`);
    if (partitioned.has(id)) return { replicaId: id, partitioned: true, applied: 0, sequence: replica.head().sequence };
    const cursor = replica.head().sequence;
    const events = sourceAuthority.exportEvents({ afterSequence: cursor });
    if (events.length === 0) return { replicaId: id, partitioned: false, applied: 0, sequence: cursor };
    const result = replica.applyReplicatedEvents(events);
    for (const event of result.appliedEvents) {
      const timing = timingFor(id, event);
      timing.replicaAppliedAt = result.appliedAt;
    }
    return { replicaId: id, partitioned: false, applied: result.applied, sequence: result.sequence, headHash: result.headHash };
  }

  function replicateAll() {
    return [...replicaMap.keys()].map((id) => replicate(id));
  }

  function partition(replicaId) {
    const id = requiredString(replicaId, 'revocation replica id');
    if (!replicaMap.has(id)) throw new Error(`unknown revocation replica: ${id}`);
    partitioned.add(id);
    return { replicaId: id, partitioned: true };
  }

  function heal(replicaId) {
    const id = requiredString(replicaId, 'revocation replica id');
    if (!replicaMap.has(id)) throw new Error(`unknown revocation replica: ${id}`);
    partitioned.delete(id);
    return replicate(id);
  }

  function noteCacheInvalidated(replicaId, eventId, atMs = nowMs()) {
    const id = requiredString(replicaId, 'revocation replica id');
    const event = sourceAuthority.exportEvents({ afterSequence: 0 }).find((candidate) => candidate.eventId === eventId);
    if (!event) throw new Error(`unknown revocation event: ${eventId}`);
    const timing = timingFor(id, event);
    if (!timing.cacheInvalidatedAt) timing.cacheInvalidatedAt = new Date(atMs).toISOString();
    return eventTiming(id, eventId);
  }

  function markDenied(replicaId, eventId, atMs = nowMs()) {
    const id = requiredString(replicaId, 'revocation replica id');
    const event = sourceAuthority.exportEvents({ afterSequence: 0 }).find((candidate) => candidate.eventId === eventId);
    if (!event) throw new Error(`unknown revocation event: ${eventId}`);
    const timing = timingFor(id, event);
    if (!timing.firstDeniedAt) timing.firstDeniedAt = new Date(atMs).toISOString();
    return eventTiming(id, eventId);
  }

  function eventTiming(replicaId, eventId) {
    const timing = timings.get(timingKey(replicaId, eventId));
    if (!timing) return null;
    const appended = Date.parse(timing.durableAppendedAt);
    const applied = timing.replicaAppliedAt ? Date.parse(timing.replicaAppliedAt) : null;
    const invalidated = timing.cacheInvalidatedAt ? Date.parse(timing.cacheInvalidatedAt) : null;
    const denied = timing.firstDeniedAt ? Date.parse(timing.firstDeniedAt) : null;
    return Object.freeze({
      ...structuredClone(timing),
      appendToReplicaMs: applied == null ? null : Math.max(0, applied - appended),
      appendToInvalidationMs: invalidated == null ? null : Math.max(0, invalidated - appended),
      revocationPropagationMs: denied == null ? null : Math.max(0, denied - appended),
      healToDenialMs: denied == null || applied == null ? null : Math.max(0, denied - applied)
    });
  }

  return Object.freeze({
    partition,
    heal,
    replicate,
    replicateAll,
    noteCacheInvalidated,
    markDenied,
    eventTiming,
    status() {
      return [...replicaMap.entries()].map(([id, authority]) => ({ id, partitioned: partitioned.has(id), sequence: authority.head().sequence }));
    }
  });
}

export function assessActiveTrustWithOperationalRevocation({ revocationAuthority = null, ...input } = {}) {
  if (!revocationAuthority) return assessActiveTrust(input);
  if (typeof revocationAuthority.isRevoked !== 'function' || typeof revocationAuthority.epochFor !== 'function') {
    throw new Error('operational trust assessment requires revocationAuthority');
  }

  const claim = input.claim;
  if (claim?.claimId && revocationAuthority.isRevoked('trust-evidence', claim.claimId)) {
    const epoch = revocationAuthority.epochFor('trust-evidence');
    return {
      protocol: 'truyn-active-trust-assessment-v1',
      version: 1,
      claimId: claim.claimId,
      lifecycleStatus: 'revoked',
      activeAttestations: 0,
      staleAttestations: 0,
      revokedAttestations: (input.attestations || []).length,
      uncertifiedAttestations: 0,
      unauthorizedAttestations: 0,
      activeDisputes: 0,
      operationalRevocation: { sequence: epoch.sequence, headHash: epoch.headHash },
      truthAssessment: { status: 'revoked', reason: 'trust_evidence_revoked', calibratedTruthProbability: null }
    };
  }

  const attestations = input.attestations || [];
  const lineageCertificates = input.lineageCertificates || [];
  const filteredAttestations = attestations.filter((attestation) => !revocationAuthority.isRevoked('trust-evidence', attestation.attestationId));
  const filteredCertificates = lineageCertificates.filter((certificate) => !revocationAuthority.isRevoked('trust-evidence', certificate.certificateId));
  const removedAttestations = attestations.length - filteredAttestations.length;
  const removedCertificates = lineageCertificates.length - filteredCertificates.length;
  const assessment = assessActiveTrust({ ...input, attestations: filteredAttestations, lineageCertificates: filteredCertificates });
  const epoch = revocationAuthority.epochFor('trust-evidence');
  return {
    ...assessment,
    revokedAttestations: (assessment.revokedAttestations || 0) + removedAttestations,
    operationallyRevokedLineageCertificates: removedCertificates,
    operationalRevocation: { sequence: epoch.sequence, headHash: epoch.headHash }
  };
}
