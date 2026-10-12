import { createHash } from 'node:crypto';

const hash = text => createHash('sha256').update(text).digest('hex');
const nonempty = value => typeof value === 'string' && value.length > 0 && value.length <= 4096;
const fail = (status, code) => { throw Object.assign(new Error(code), { httpStatus: status, publicCode: code }); };
const copy = value => structuredClone(value);

// One versioned shared document is the authoritative bounded directory, not a
// per-process cache. Storage MUST implement atomic create-if-absent / ETag CAS.
// Existing per-OFFER ledger records are NOT silently migrated into this profile.
export function createDurableOfferDirectory({ storage, verifyEnvelope, canonicalize,
  authorityId, maxRecords = 256, maxBytes = 850_000, maxCasAttempts = 8,
  clock = () => new Date().toISOString() } = {}) {
  if (!storage || typeof storage.read !== 'function' || typeof storage.cas !== 'function' ||
      typeof verifyEnvelope !== 'function' || typeof canonicalize !== 'function' ||
      typeof clock !== 'function' || !nonempty(authorityId) ||
      !Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 4096 ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 2048 || maxBytes > 1_800_000 ||
      !Number.isSafeInteger(maxCasAttempts) || maxCasAttempts < 1 || maxCasAttempts > 32)
    fail(503, 'offer_directory_configuration_required');
  const id = 'g5-offer-directory-' + hash(authorityId);
  const fingerprint = envelope => hash(canonicalize(envelope));
  function timestamp() {
    const value = clock();
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
      fail(503, 'offer_directory_clock_invalid');
    return value;
  }
  function validate(doc) {
    if (!doc || doc.id !== id || doc.partitionKey !== id || doc.schema !== 'truyn.g5.offer-directory/v1' ||
        doc.authorityId !== authorityId || doc.ttl !== -1 || doc.maxRecords !== maxRecords || doc.maxBytes !== maxBytes ||
        !Number.isSafeInteger(doc.version) || doc.version < 1 || doc.version >= Number.MAX_SAFE_INTEGER ||
        !Array.isArray(doc.entries) || doc.entries.length > maxRecords)
      fail(503, 'offer_directory_integrity_error');
    const ids = new Set();
    for (const row of doc.entries) {
      if (!nonempty(row?.id) || !nonempty(row?.owner) || !nonempty(row?.capability) ||
          !/^[a-f0-9]{64}$/.test(row?.fingerprint || '') || ids.has(row.id) ||
          typeof row.revoked !== 'boolean' || !Number.isFinite(Date.parse(row.publishedAt)) ||
          (row.revoked && !Number.isFinite(Date.parse(row.revokedAt))))
        fail(503, 'offer_directory_integrity_error');
      ids.add(row.id);
      if (row.envelope === null) {
        if (!row.revoked) fail(503, 'offer_directory_active_payload_missing');
      } else {
        const result = verifyEnvelope(row.envelope, { allowedTypes: ['OFFER'] });
        if (result?.ok !== true || row.envelope.id !== row.id || row.envelope.from !== row.owner ||
            (row.envelope.payload?.capability?.name || row.envelope.payload?.capability) !== row.capability ||
            fingerprint(row.envelope) !== row.fingerprint)
          fail(503, 'offer_directory_integrity_error');
      }
    }
    if (Buffer.byteLength(JSON.stringify(doc)) > maxBytes) fail(503, 'offer_directory_capacity_reached');
  }
  function bounded(doc) {
    // Reserve future revokedAt and compaction timestamp space BEFORE admission.
    const reserve = doc.entries.filter(row => !row.revoked).length * 128;
    if (Buffer.byteLength(JSON.stringify(doc)) + reserve + 128 > maxBytes)
      fail(503, 'offer_directory_capacity_reached');
    validate(doc);
    return doc;
  }
  async function read() {
    const record = await storage.read(id);
    if (!record) fail(503, 'offer_directory_not_initialized');
    if (!nonempty(record.etag)) fail(503, 'offer_directory_etag_required');
    validate(record.document);
    return { etag: record.etag, document: copy(record.document) };
  }
  async function change(operation) {
    for (let n = 0; n < maxCasAttempts; n++) {
      const record = await read(), next = copy(record.document);
      const outcome = operation(next);
      if (!outcome.changed) return outcome;
      next.version++;
      bounded(next);
      // Ambiguous store errors propagate. Never blindly replay a failed CAS.
      const saved = await storage.cas(id, record.etag, next);
      if (saved === false) continue; // ONLY explicit precondition conflict permits retry.
      if (saved !== true) fail(503, 'offer_directory_commit_unknown');
      return outcome;
    }
    fail(503, 'offer_directory_contention');
  }
  return Object.freeze({
    kind: 'bounded-shared-offer-directory-v1',
    // Explicit bootstrap only; ordinary reads/publishes NEVER recreate lost state.
    async initialize() {
      const current = await storage.read(id);
      if (current) { await read(); return { initialized: false }; }
      const document = bounded({ id, partitionKey: id, schema: 'truyn.g5.offer-directory/v1',
        authorityId, maxRecords, maxBytes, ttl: -1, version: 1, entries: [] });
      const saved = await storage.cas(id, null, document);
      if (saved !== true && saved !== false) fail(503, 'offer_directory_commit_unknown');
      await read();
      return { initialized: saved };
    },
    async publish({ envelope, authenticatedOwner } = {}) {
      if (!nonempty(authenticatedOwner) || envelope?.from !== authenticatedOwner)
        fail(403, 'offer_directory_owner_required');
      if (verifyEnvelope(envelope, { allowedTypes: ['OFFER'] })?.ok !== true)
        fail(400, 'offer_directory_signature_invalid');
      const capability = envelope.payload?.capability?.name || envelope.payload?.capability;
      if (!nonempty(envelope.id) || !nonempty(capability)) fail(400, 'invalid_offer');
      const commitment = fingerprint(envelope);
      return change(doc => {
        const old = doc.entries.find(row => row.id === envelope.id);
        if (old) {
          if (old.owner !== authenticatedOwner || old.fingerprint !== commitment)
            fail(409, 'offer_directory_identity_conflict');
          if (old.revoked) fail(409, 'offer_directory_withdrawn');
          return { changed: false, idempotent: true, offerId: old.id };
        }
        if (doc.entries.length >= maxRecords) fail(503, 'offer_directory_capacity_reached');
        doc.entries.push({ id: envelope.id, owner: authenticatedOwner, capability,
          fingerprint: commitment, revoked: false, publishedAt: timestamp(), revokedAt: null, envelope: copy(envelope) });
        return { changed: true, idempotent: false, offerId: envelope.id };
      });
    },
    async withdraw({ envelope, authenticatedOwner } = {}) {
      if (!nonempty(authenticatedOwner) || envelope?.from !== authenticatedOwner)
        fail(403, 'offer_directory_owner_required');
      if (verifyEnvelope(envelope, { allowedTypes: ['REVOKE'] })?.ok !== true ||
          envelope.payload?.targetKind !== 'offer' || !nonempty(envelope.payload?.targetId))
        fail(400, 'offer_directory_revoke_invalid');
      return change(doc => {
        const row = doc.entries.find(row => row.id === envelope.payload.targetId);
        if (!row) fail(404, 'offer_not_found');
        if (row.owner !== authenticatedOwner) fail(403, 'not_target_owner');
        if (row.revoked) return { changed: false, idempotent: true };
        row.revoked = true; row.revokedAt = timestamp(); row.revokeFingerprint = fingerprint(envelope);
        return { changed: true, idempotent: false };
      });
    },
    async discover({ requester, capability = null, authorize } = {}) {
      if (!nonempty(requester) || typeof authorize !== 'function') fail(403, 'offer_directory_authorization_required');
      const { document } = await read(), result = [];
      for (const row of document.entries) {
        if (row.revoked || (capability !== null && row.capability !== capability)) continue;
        // Every read reapplies the caller's current server-side authorization.
        // Directory discovery alone grants neither session liveness nor dispatch.
        if (await authorize({ requester, owner: row.owner, envelope: copy(row.envelope) }) === true)
          result.push(copy(row.envelope));
      }
      return result;
    },
    async compactWithdrawn() {
      return change(doc => {
        let compacted = 0;
        for (const row of doc.entries) if (row.revoked && row.envelope !== null) {
          row.envelope = null; row.compactedAt = timestamp(); compacted++;
        }
        // IDs, owners, fingerprints, revocation and occupancy are NEVER removed.
        return { changed: compacted > 0, compacted, tombstones: doc.entries.filter(row => row.revoked).length };
      });
    },
    async lookup(offerId) {
      if (!nonempty(offerId)) fail(400, 'invalid_offer');
      const { document } = await read();
      return copy(document.entries.find(row => row.id === offerId) || null);
    },
    async inspectCapacity() {
      const { document } = await read();
      return { version: document.version, records: document.entries.length, maxRecords,
        bytes: Buffer.byteLength(JSON.stringify(document)), maxBytes,
        replayHorizon: 'unbounded-until-explicit-versioned-migration', automaticIdReuse: false };
    }
  });
}
