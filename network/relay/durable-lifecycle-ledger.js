import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

// SQLite is a single-host/single-shared-local-disk durability adapter, NOT a
// distributed database. In particular, WAL on an NFS-mounted SQLite file does
// not qualify cross-host or split-brain G5 production admission.
export const lifecycleFingerprint = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fault(status, code) {
  const error = new Error(code);
  error.httpStatus = status;
  error.publicCode = code;
  return error;
}

export function createSqliteLifecycleLedger({ filePath, maxRecords = 262144 } = {}) {
  if (!filePath || typeof filePath !== 'string') throw new Error('durable lifecycle filePath is required');
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1) throw new Error('maxRecords must be a positive safe integer');
  const db = new DatabaseSync(filePath);
  try {
    db.exec(`PRAGMA busy_timeout=5000;
PRAGMA journal_mode=WAL;
PRAGMA synchronous=FULL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS lifecycle_needs (
  id TEXT PRIMARY KEY NOT NULL,
  requester TEXT NOT NULL,
  provider TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  capability TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('matched','completed','cancelled','failed')),
  created_at TEXT NOT NULL,
  terminal_at TEXT,
  partial_sequence INTEGER NOT NULL DEFAULT 0,
  partial_digest TEXT
);
CREATE TABLE IF NOT EXISTS lifecycle_offers (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0,1))
);
CREATE TABLE IF NOT EXISTS provider_effects (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  requester TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started','completed','failed','unknown')),
  created_at TEXT NOT NULL,
  finished_at TEXT
);`);
  } catch (error) {
    db.close();
    throw error;
  }
  const oneNeed = db.prepare('SELECT * FROM lifecycle_needs WHERE id = ?');
  const oneOffer = db.prepare('SELECT * FROM lifecycle_offers WHERE id = ?');
  const oneEffect = db.prepare('SELECT * FROM provider_effects WHERE id = ?');
  const countNeeds = db.prepare('SELECT COUNT(*) AS count FROM lifecycle_needs');
  const countOffers = db.prepare('SELECT COUNT(*) AS count FROM lifecycle_offers');
  const countEffects = db.prepare('SELECT COUNT(*) AS count FROM provider_effects');
  const insertNeed = db.prepare("INSERT INTO lifecycle_needs (id,requester,provider,fingerprint,capability,mode,status,created_at) VALUES (?,?,?,?,?,?,'matched',?)");
  const insertOffer = db.prepare('INSERT INTO lifecycle_offers (id,owner,fingerprint) VALUES (?,?,?)');
  const updateOffer = db.prepare('UPDATE lifecycle_offers SET revoked=1 WHERE id=? AND owner=? AND revoked=0');
  const updateNeed = db.prepare("UPDATE lifecycle_needs SET status=?,terminal_at=? WHERE id=? AND status='matched'");
  const updatePartial = db.prepare("UPDATE lifecycle_needs SET partial_sequence=?,partial_digest=? WHERE id=? AND status='matched' AND partial_sequence=?");
  const rollbackPartial = db.prepare("UPDATE lifecycle_needs SET partial_sequence=?,partial_digest=? WHERE id=? AND status='matched' AND partial_sequence=? AND partial_digest=?");
  const insertEffect = db.prepare("INSERT INTO provider_effects (id,provider,requester,fingerprint,status,created_at) VALUES (?,?,?,?,'started',?)");
  const updateEffect = db.prepare("UPDATE provider_effects SET status=?,finished_at=? WHERE id=? AND provider=? AND status='started'");

  function transaction(operation) {
    try {
      db.exec('BEGIN IMMEDIATE');
    } catch {
      throw fault(503, 'lifecycle_ledger_unavailable');
    }
    try {
      const result = operation();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      if (Number.isInteger(error.httpStatus)) throw error;
      throw fault(503, 'lifecycle_ledger_unavailable');
    }
  }
  const lookup = (statement, id) => {
    try { return statement.get(id) || null; }
    catch { throw fault(503, 'lifecycle_ledger_unavailable'); }
  };

  return Object.freeze({
    kind: 'sqlite-single-host-v1',
    getNeed: (id) => lookup(oneNeed, id),
    getOffer: (id) => lookup(oneOffer, id),
    getEffect: (id) => lookup(oneEffect, id),
    reserveNeed({ id, requester, provider, fingerprint, capability, mode }) {
      if (![id, requester, provider, fingerprint, capability, mode].every(x => typeof x === 'string' && x.length > 0))
        throw fault(400, 'invalid_lifecycle_reservation');
      return transaction(() => {
        if (oneNeed.get(id)) throw fault(409, 'duplicate_request');
        if (countNeeds.get().count >= maxRecords) throw fault(503, 'need_idempotency_capacity_reached');
        insertNeed.run(id, requester, provider, fingerprint, capability, mode, new Date().toISOString());
        return oneNeed.get(id);
      });
    },
    reserveOffer({ id, owner, fingerprint }) {
      if (![id, owner, fingerprint].every(x => typeof x === 'string' && x.length > 0)) throw fault(400, 'invalid_offer_reservation');
      return transaction(() => {
        if (oneOffer.get(id)) throw fault(409, 'duplicate_offer');
        if (countOffers.get().count >= maxRecords) throw fault(503, 'offer_idempotency_capacity_reached');
        insertOffer.run(id, owner, fingerprint);
        return oneOffer.get(id);
      });
    },
    revokeOffer({ id, owner }) {
      return transaction(() => {
        const row = oneOffer.get(id);
        if (!row) throw fault(404, 'target_not_found');
        if (row.owner !== owner) throw fault(403, 'not_target_owner');
        updateOffer.run(id, owner);
        return oneOffer.get(id);
      });
    },
    transitionNeed({ id, requester, provider, to }) {
      if (!['cancelled','completed','failed'].includes(to)) throw fault(400, 'invalid_lifecycle_transition');
      return transaction(() => {
        const row = oneNeed.get(id);
        if (!row) throw fault(404, 'request_not_found');
        if (requester && row.requester !== requester) throw fault(403, 'not_request_owner');
        if (provider && row.provider !== provider) throw fault(403, 'provider_mismatch');
        if (row.status !== 'matched') {
          if (to === 'cancelled' && row.status === 'cancelled') return { changed: false, row };
          const reason = row.status === 'cancelled' ? 'request_cancelled' :
            row.status === 'failed' ? 'request_failed' : 'request_already_completed';
          throw fault(409, reason);
        }
        if (updateNeed.run(to, new Date().toISOString(), id).changes !== 1) throw fault(409, 'lifecycle_conflict');
        return { changed: true, row: oneNeed.get(id) };
      });
    },
    acceptPartial({ id, provider, sequence, digest }) {
      if (!Number.isSafeInteger(sequence) || sequence < 0) throw fault(400, 'invalid_partial_sequence');
      return transaction(() => {
        const row = oneNeed.get(id);
        if (!row) throw fault(404, 'request_not_found');
        if (row.provider !== provider) throw fault(403, 'provider_mismatch');
        if (row.status !== 'matched') throw fault(409, row.status === 'cancelled' ? 'request_cancelled' : row.status === 'failed' ? 'request_failed' : 'request_already_completed');
        if (sequence === row.partial_sequence - 1 && digest === row.partial_digest) return { idempotent: true };
        if (sequence !== row.partial_sequence) throw fault(409, 'partial_sequence_mismatch');
        if (updatePartial.run(sequence + 1, digest, id, sequence).changes !== 1) throw fault(409, 'partial_sequence_mismatch');
        return { idempotent: false, previousDigest: row.partial_digest };
      });
    },
    rollbackPartial({ id, sequence, digest, previousDigest = null }) {
      // Called only when the event could not be queued or delivered at all.
      return transaction(() => rollbackPartial.run(sequence, previousDigest, id, sequence + 1, digest).changes === 1);
    },
    beginEffect({ id, provider, requester, fingerprint }) {
      if (![id, provider, requester, fingerprint].every(x => typeof x === 'string' && x.length > 0)) throw fault(400, 'invalid_effect_intent');
      return transaction(() => {
        const existing = oneEffect.get(id);
        if (existing) {
          // Replays are only idempotent if they attest the same original
          // requester, selected provider and signed logical work fingerprint.
          // A forged/colliding ID may not impersonate or suppress this intent.
          if (existing.provider !== provider || existing.requester !== requester || existing.fingerprint !== fingerprint)
            throw fault(409, 'effect_identity_conflict');
          return { acquired: false, existing };
        }
        if (countEffects.get().count >= maxRecords) throw fault(503, 'effect_idempotency_capacity_reached');
        insertEffect.run(id, provider, requester, fingerprint, new Date().toISOString());
        return { acquired: true, existing: null };
      });
    },
    finishEffect({ id, provider, outcome }) {
      if (!['completed','failed','unknown'].includes(outcome)) throw fault(400, 'invalid_effect_outcome');
      return transaction(() => {
        const row = oneEffect.get(id);
        if (!row || row.provider !== provider) throw fault(403, 'provider_mismatch');
        if (row.status !== 'started') return { changed: false, row };
        updateEffect.run(outcome, new Date().toISOString(), id, provider);
        return { changed: true, row: oneEffect.get(id) };
      });
    },
    close() { db.close(); }
  });
}
