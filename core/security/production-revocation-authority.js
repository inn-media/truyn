import { createHash } from 'node:crypto';
import { canonicalize } from '../protocol/index.js';
import { createDurableJsonStore } from './durable-json-store.js';

export const OPERATIONAL_REVOCATION_PROTOCOL = 'truyn-operational-revocation-v1';
export const OPERATIONAL_REVOCATION_VERSION = 1;

const KINDS = new Set([
  'account',
  'organization',
  'tenant',
  'membership',
  'principal',
  'node',
  'provider',
  'grant',
  'entitlement',
  'request',
  'authority-root',
  'authority-certificate',
  'authority-key',
  'trust-evidence'
]);

const OPERATIONAL_KIND_BY_TARGET_KIND = Object.freeze({
  membership: 'membership',
  grant: 'provider-grant',
  entitlement: 'entitlement',
  provider: 'provider',
  'authority-root': 'authority',
  'authority-key': 'authority',
  'authority-certificate': 'delegation',
  'trust-evidence': 'trust-evidence'
});

function requiredString(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function keyFor(kind, id) {
  return `${kind}:${id}`;
}

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
}

const GENESIS_HEAD = digest({ protocol: OPERATIONAL_REVOCATION_PROTOCOL, version: OPERATIONAL_REVOCATION_VERSION, genesis: true });

function operationalKindFor(targetKind, requested = null) {
  const explicit = typeof requested === 'string' ? requested.trim().toLowerCase() : '';
  return explicit || OPERATIONAL_KIND_BY_TARGET_KIND[targetKind] || targetKind;
}

function defaultState() {
  return {
    version: 2,
    revision: 0,
    sequence: 0,
    authorityEpoch: 0,
    headHash: GENESIS_HEAD,
    revocations: {},
    kindEpochs: {},
    events: []
  };
}

function eventIdFor(event) {
  const { eventId: _eventId, eventHash: _eventHash, ...body } = event;
  return `truyn:revocation:${digest(body).slice('sha256:'.length)}`;
}

function eventHashFor(event) {
  const { eventHash: _eventHash, ...body } = event;
  return digest(body);
}

function cloneScope(scope) {
  if (scope == null) return null;
  if (typeof scope !== 'object' || Array.isArray(scope)) throw new Error('revocation scope must be an object or null');
  return structuredClone(scope);
}

function normalizeState(state) {
  state.version = 2;
  state.sequence = Number.isSafeInteger(state.sequence) && state.sequence >= 0 ? state.sequence : 0;
  state.authorityEpoch = Number.isSafeInteger(state.authorityEpoch) && state.authorityEpoch >= 0 ? state.authorityEpoch : state.sequence;
  state.headHash = typeof state.headHash === 'string' && state.headHash ? state.headHash : GENESIS_HEAD;
  state.revocations ||= {};
  state.kindEpochs ||= {};
  state.events = Array.isArray(state.events) ? state.events : [];
  return state;
}

function verifyEvent(event, expectedSequence, expectedPreviousHash) {
  if (!event || event.protocol !== OPERATIONAL_REVOCATION_PROTOCOL || event.version !== OPERATIONAL_REVOCATION_VERSION) {
    throw new Error('revocation_event_protocol_invalid');
  }
  if (event.sequence !== expectedSequence || event.authorityEpoch !== expectedSequence) throw new Error('revocation_replica_gap');
  if (event.previousHash !== expectedPreviousHash) throw new Error('revocation_event_previous_hash_invalid');
  if (!KINDS.has(event.targetKind)) throw new Error('revocation_event_target_kind_invalid');
  requiredString(event.kind, 'revocation event kind');
  requiredString(event.targetId, 'revocation event targetId');
  requiredString(event.reasonClass, 'revocation event reasonClass');
  requiredString(event.issuerAuthorityId, 'revocation event issuerAuthorityId');
  if (event.issuerKeyId != null) requiredString(event.issuerKeyId, 'revocation event issuerKeyId');
  if (!Number.isFinite(Date.parse(event.issuedAt)) || !Number.isFinite(Date.parse(event.effectiveAt))) throw new Error('revocation_event_time_invalid');
  if (event.eventId !== eventIdFor(event)) throw new Error('revocation_event_id_invalid');
  if (event.eventHash !== eventHashFor(event)) throw new Error('revocation_event_hash_invalid');
  return true;
}

function verifyState(state) {
  normalizeState(state);
  let previousHash = GENESIS_HEAD;
  let sequence = 0;
  for (const event of state.events) {
    sequence += 1;
    verifyEvent(event, sequence, previousHash);
    previousHash = event.eventHash;
  }
  if (state.sequence !== sequence || state.authorityEpoch !== sequence) throw new Error('revocation_sequence_log_mismatch');
  if (state.headHash !== previousHash) throw new Error('revocation_head_log_mismatch');
  return state;
}

function appendEvent(state, {
  targetKind,
  targetId,
  operationalKind = null,
  reasonClass,
  scope = null,
  emergency = false,
  issuedAt,
  effectiveAt = issuedAt,
  issuerAuthorityId = 'local-control-plane',
  issuerKeyId = null
}) {
  normalizeState(state);
  const sequence = state.sequence + 1;
  const event = {
    protocol: OPERATIONAL_REVOCATION_PROTOCOL,
    version: OPERATIONAL_REVOCATION_VERSION,
    sequence,
    authorityEpoch: sequence,
    kind: operationalKindFor(targetKind, operationalKind),
    targetKind,
    targetId,
    scope: cloneScope(scope),
    reasonClass,
    emergency: Boolean(emergency),
    effectiveAt,
    issuedAt,
    issuerAuthorityId,
    issuerKeyId,
    previousHash: state.headHash || GENESIS_HEAD
  };
  event.eventId = eventIdFor(event);
  event.eventHash = eventHashFor(event);
  state.events.push(event);
  state.sequence = sequence;
  state.authorityEpoch = sequence;
  state.headHash = event.eventHash;
  state.kindEpochs[event.kind] = (Number.isSafeInteger(state.kindEpochs[event.kind]) ? state.kindEpochs[event.kind] : 0) + 1;
  return event;
}

export function createProductionRevocationAuthority({
  filePath,
  now = () => new Date().toISOString(),
  replicaMode = false
} = {}) {
  const store = createDurableJsonStore({ filePath, defaultState: defaultState() });
  const listeners = new Set();

  const initial = store.read();
  const needsMigration = initial.version !== 2 || !Array.isArray(initial.events) || !Number.isSafeInteger(initial.sequence) || !initial.headHash || !initial.kindEpochs;
  if (needsMigration) {
    store.transaction((state) => {
      const legacyRevocations = Object.entries(state.revocations || {}).sort(([a], [b]) => a.localeCompare(b));
      Object.assign(state, {
        version: 2,
        sequence: 0,
        authorityEpoch: 0,
        headHash: GENESIS_HEAD,
        kindEpochs: {},
        events: []
      });
      state.revocations ||= {};
      for (const [, record] of legacyRevocations) {
        appendEvent(state, {
          targetKind: record.kind,
          targetId: record.id,
          reasonClass: record.reason || 'legacy_revocation',
          issuedAt: record.revokedAt || now(),
          effectiveAt: record.revokedAt || now(),
          issuerAuthorityId: 'legacy-import'
        });
      }
      return { migrated: true, imported: legacyRevocations.length };
    });
  }
  verifyState(store.read());

  function normalize(kind, id) {
    const normalizedKind = requiredString(kind, 'revocation kind').toLowerCase();
    if (!KINDS.has(normalizedKind)) throw new Error(`Unsupported revocation kind: ${kind}`);
    return { kind: normalizedKind, id: requiredString(id, 'revocation id') };
  }

  function notify(events, context = {}) {
    for (const event of events) {
      for (const listener of listeners) {
        try { listener(structuredClone(event), Object.freeze({ ...context })); } catch {}
      }
    }
  }

  function revokeWithEvent(kind, id, {
    reason = 'revoked_by_authority',
    metadata = null,
    scope = null,
    operationalKind = null,
    emergency = false,
    effectiveAt = null,
    issuerAuthorityId = 'local-control-plane',
    issuerKeyId = null
  } = {}) {
    if (replicaMode) throw new Error('revocation_replica_read_only');
    const subject = normalize(kind, id);
    const issuedAt = now();
    const effective = effectiveAt || issuedAt;
    if (!Number.isFinite(Date.parse(effective))) throw new Error('revocation effectiveAt is invalid');
    const transaction = store.transaction((state) => {
      verifyState(state);
      state.revocations ||= {};
      const key = keyFor(subject.kind, subject.id);
      const existing = state.revocations[key];
      if (existing) {
        const existingEvent = state.events.find((event) => event.eventId === existing.eventId) || null;
        return { record: existing, event: existingEvent, created: false };
      }
      const record = {
        kind: subject.kind,
        id: subject.id,
        status: 'revoked',
        reason: requiredString(reason, 'revocation reason'),
        revokedAt: effective,
        metadata: metadata == null ? null : structuredClone(metadata)
      };
      const event = appendEvent(state, {
        targetKind: subject.kind,
        targetId: subject.id,
        operationalKind,
        reasonClass: record.reason,
        scope,
        emergency,
        issuedAt,
        effectiveAt: effective,
        issuerAuthorityId: requiredString(issuerAuthorityId, 'issuerAuthorityId'),
        issuerKeyId: issuerKeyId == null ? null : requiredString(issuerKeyId, 'issuerKeyId')
      });
      record.eventId = event.eventId;
      state.revocations[key] = record;
      return { record, event, created: true };
    });
    if (transaction.result.created && transaction.result.event) {
      notify([transaction.result.event], { source: true, appliedAt: issuedAt });
    }
    return transaction.result;
  }

  function revoke(kind, id, options = {}) {
    return revokeWithEvent(kind, id, options).record;
  }

  function get(kind, id) {
    const subject = normalize(kind, id);
    return structuredClone(verifyState(store.read()).revocations?.[keyFor(subject.kind, subject.id)] || null);
  }

  function isRevoked(kind, id) {
    return Boolean(get(kind, id));
  }

  function assertNotRevoked(kind, id) {
    const record = get(kind, id);
    if (!record) return { ok: true };
    return { ok: false, reason: `${kind}_revoked`, revocation: record };
  }

  function exportEvents({ afterSequence = 0, limit = 1_000 } = {}) {
    const cursor = Number(afterSequence);
    const max = Number(limit);
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('afterSequence must be a non-negative integer');
    if (!Number.isSafeInteger(max) || max < 1 || max > 10_000) throw new Error('limit must be between 1 and 10000');
    const state = verifyState(store.read());
    return structuredClone(state.events.filter((event) => event.sequence > cursor).slice(0, max));
  }

  function applyReplicatedEvents(events = []) {
    if (!replicaMode) throw new Error('revocation_source_cannot_apply_replica_batch');
    if (!Array.isArray(events)) throw new Error('replicated revocation events must be an array');
    const transaction = store.transaction((state) => {
      verifyState(state);
      const applied = [];
      for (const incoming of events) {
        const event = structuredClone(incoming);
        if (Number.isSafeInteger(event.sequence) && event.sequence <= state.sequence) {
          const existing = state.events[event.sequence - 1];
          if (!existing || existing.eventId !== event.eventId || existing.eventHash !== event.eventHash) throw new Error('revocation_replica_conflict');
          continue;
        }
        const expectedSequence = state.sequence + 1;
        verifyEvent(event, expectedSequence, state.headHash || GENESIS_HEAD);
        const key = keyFor(event.targetKind, event.targetId);
        const existingRecord = state.revocations?.[key];
        if (existingRecord && existingRecord.eventId && existingRecord.eventId !== event.eventId) throw new Error('revocation_replica_target_conflict');
        state.revocations ||= {};
        state.revocations[key] = existingRecord || {
          kind: event.targetKind,
          id: event.targetId,
          status: 'revoked',
          reason: event.reasonClass,
          revokedAt: event.effectiveAt,
          metadata: { replicated: true },
          eventId: event.eventId
        };
        state.events.push(event);
        state.sequence = event.sequence;
        state.authorityEpoch = event.authorityEpoch;
        state.headHash = event.eventHash;
        state.kindEpochs[event.kind] = (Number.isSafeInteger(state.kindEpochs[event.kind]) ? state.kindEpochs[event.kind] : 0) + 1;
        applied.push(event);
      }
      return { applied, sequence: state.sequence, headHash: state.headHash };
    });
    const appliedAt = now();
    if (transaction.result.applied.length > 0) notify(transaction.result.applied, { source: false, replicated: true, appliedAt });
    return {
      applied: transaction.result.applied.length,
      appliedEvents: structuredClone(transaction.result.applied),
      sequence: transaction.result.sequence,
      headHash: transaction.result.headHash,
      appliedAt
    };
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new Error('revocation listener is required');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function epochFor(kind) {
    const normalizedKind = requiredString(kind, 'operational revocation kind').toLowerCase();
    const state = verifyState(store.read());
    return Object.freeze({
      global: state.authorityEpoch || 0,
      kind: state.kindEpochs?.[normalizedKind] || 0,
      sequence: state.sequence || 0,
      headHash: state.headHash || GENESIS_HEAD
    });
  }

  function head() {
    const state = verifyState(store.read());
    return Object.freeze({ sequence: state.sequence || 0, authorityEpoch: state.authorityEpoch || 0, headHash: state.headHash || GENESIS_HEAD });
  }

  return Object.freeze({
    durable: true,
    replicaMode: Boolean(replicaMode),
    revoke,
    revokeWithEvent,
    get,
    isRevoked,
    assertNotRevoked,
    exportEvents,
    applyReplicatedEvents,
    subscribe,
    epochFor,
    head,
    snapshot: () => verifyState(store.read()),
    get revision() { return store.read().revision || 0; }
  });
}
