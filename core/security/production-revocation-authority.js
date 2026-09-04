import { createDurableJsonStore } from './durable-json-store.js';

const KINDS = new Set(['account', 'organization', 'tenant', 'membership', 'principal', 'node', 'provider', 'grant', 'entitlement', 'request']);

function requiredString(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function keyFor(kind, id) {
  return `${kind}:${id}`;
}

export function createProductionRevocationAuthority({ filePath, now = () => new Date().toISOString() } = {}) {
  const store = createDurableJsonStore({
    filePath,
    defaultState: { version: 1, revision: 0, revocations: {} }
  });

  function normalize(kind, id) {
    const normalizedKind = requiredString(kind, 'revocation kind').toLowerCase();
    if (!KINDS.has(normalizedKind)) throw new Error(`Unsupported revocation kind: ${kind}`);
    return { kind: normalizedKind, id: requiredString(id, 'revocation id') };
  }

  function revoke(kind, id, { reason = 'revoked_by_authority', metadata = null } = {}) {
    const subject = normalize(kind, id);
    return store.transaction((state) => {
      state.revocations ||= {};
      const key = keyFor(subject.kind, subject.id);
      const existing = state.revocations[key];
      if (existing) return existing;
      const record = {
        kind: subject.kind,
        id: subject.id,
        status: 'revoked',
        reason: requiredString(reason, 'revocation reason'),
        revokedAt: now(),
        metadata: metadata == null ? null : structuredClone(metadata)
      };
      state.revocations[key] = record;
      return record;
    }).result;
  }

  function get(kind, id) {
    const subject = normalize(kind, id);
    return structuredClone(store.read().revocations?.[keyFor(subject.kind, subject.id)] || null);
  }

  function isRevoked(kind, id) {
    return Boolean(get(kind, id));
  }

  function assertNotRevoked(kind, id) {
    const record = get(kind, id);
    if (!record) return { ok: true };
    return { ok: false, reason: `${kind}_revoked`, revocation: record };
  }

  return Object.freeze({
    durable: true,
    revoke,
    get,
    isRevoked,
    assertNotRevoked,
    snapshot: () => store.read(),
    get revision() { return store.read().revision || 0; }
  });
}
