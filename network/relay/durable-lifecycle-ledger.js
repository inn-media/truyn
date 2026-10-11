import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

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
  // Signed event payloads are stored in this ledger. Refuse directories
  // readable by other accounts or symlinks to other storage locations.
  const parent = lstatSync(dirname(filePath));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077) !== 0) throw new Error('lifecycle storage directory must be private (0700)');
  try {
    if (lstatSync(filePath).isSymbolicLink()) throw new Error('lifecycle storage file must not be a symlink');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const db = new DatabaseSync(filePath);
  try { chmodSync(filePath, 0o600); }
  catch (error) { db.close(); throw error; }
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
CREATE TABLE IF NOT EXISTS lifecycle_outbox (
  event_id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL REFERENCES lifecycle_needs(id),
  recipient TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('NEED','PARTIAL','RESULT','REVOKE')),
  event_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  acknowledged_at TEXT
);
CREATE INDEX IF NOT EXISTS lifecycle_outbox_recipient ON lifecycle_outbox(recipient, acknowledged_at, created_at);
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
    // Existing G5 v1 SQLite files constrain outbox kinds to NEED/RESULT/REVOKE.
    // The migration copies ACKed and pending rows in ONE transaction, so a
    // power loss cannot expose a mixed schema or discard an old signed event.
    const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='lifecycle_outbox'").get()?.sql || '';
    if (!schema.includes("'PARTIAL'")) {
      db.exec(`BEGIN IMMEDIATE;
CREATE TABLE lifecycle_outbox_g5_v2 (
 event_id TEXT PRIMARY KEY NOT NULL,
 request_id TEXT NOT NULL REFERENCES lifecycle_needs(id),
 recipient TEXT NOT NULL,
 kind TEXT NOT NULL CHECK (kind IN ('NEED','PARTIAL','RESULT','REVOKE')),
 event_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 acknowledged_at TEXT
);
INSERT INTO lifecycle_outbox_g5_v2 (event_id, request_id, recipient, kind, event_json, created_at, acknowledged_at)
 SELECT event_id, request_id, recipient, kind, event_json, created_at, acknowledged_at FROM lifecycle_outbox ORDER BY rowid;
DROP TABLE lifecycle_outbox;
ALTER TABLE lifecycle_outbox_g5_v2 RENAME TO lifecycle_outbox;
CREATE INDEX lifecycle_outbox_recipient ON lifecycle_outbox(recipient, acknowledged_at, created_at);
COMMIT;`);
    }
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
  const insertOutbox = db.prepare('INSERT INTO lifecycle_outbox (event_id,request_id,recipient,kind,event_json,created_at) VALUES (?,?,?,?,?,?)');
  const countOutbox = db.prepare('SELECT COUNT(*) AS count FROM lifecycle_outbox');
  const selectOutbox = db.prepare("SELECT e.* FROM lifecycle_outbox e JOIN lifecycle_needs n ON n.id=e.request_id WHERE e.recipient=? AND e.acknowledged_at IS NULL AND (e.kind!='NEED' OR n.status='matched') ORDER BY e.rowid LIMIT ?");
  const oneOutbox = db.prepare('SELECT * FROM lifecycle_outbox WHERE event_id=?');
  const ackOutbox = db.prepare('UPDATE lifecycle_outbox SET acknowledged_at=? WHERE event_id=? AND recipient=? AND acknowledged_at IS NULL');

  function persistOutbox(requestId, expectedRecipient, expectedKind, delivery) {
    if (delivery == null) return;
    const { recipient, kind, event } = delivery;
    if (recipient !== expectedRecipient || kind !== expectedKind || !event || event.kind !== kind) throw fault(400, 'invalid_lifecycle_delivery');
    const body = JSON.stringify(event);
    if (body.length > 1024 * 1024) throw fault(413, 'lifecycle_delivery_too_large');
    if (countOutbox.get().count >= maxRecords * 8) throw fault(503, 'lifecycle_outbox_capacity_reached');
    const eventId = kind === 'PARTIAL'
      ? `partial:${requestId}:${event.sequence}`
      : `${kind.toLowerCase()}:${requestId}`;
    insertOutbox.run(eventId, requestId, recipient, kind, body, new Date().toISOString());
  }

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
    pendingDeliveries({ recipient, limit = 32 }) {
      if (typeof recipient !== 'string' || !recipient || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw fault(400, 'invalid_delivery_query');
      try { return selectOutbox.all(recipient, limit).map(row=>({ eventId:row.event_id, kind:row.kind, requestId:row.request_id, event:JSON.parse(row.event_json), createdAt:row.created_at })); }
      catch { throw fault(503, 'lifecycle_ledger_unavailable'); }
    },
    acknowledgeDelivery({ eventId, recipient }) {
      if (typeof eventId !== 'string' || !eventId || typeof recipient !== 'string' || !recipient) throw fault(400, 'invalid_delivery_ack');
      return transaction(() => {
        const row = oneOutbox.get(eventId);
        if (!row || row.recipient !== recipient) throw fault(404, 'delivery_not_found');
        if (row.acknowledged_at) return { acknowledged: true, idempotent: true };
        if (ackOutbox.run(new Date().toISOString(), eventId, recipient).changes !== 1) throw fault(409, 'delivery_ack_conflict');
        return { acknowledged: true, idempotent: false };
      });
    },
    reserveNeed({ id, requester, provider, fingerprint, capability, mode, delivery = null }) {
      if (![id, requester, provider, fingerprint, capability, mode].every(x => typeof x === 'string' && x.length > 0))
        throw fault(400, 'invalid_lifecycle_reservation');
      return transaction(() => {
        if (oneNeed.get(id)) throw fault(409, 'duplicate_request');
        if (countNeeds.get().count >= maxRecords) throw fault(503, 'need_idempotency_capacity_reached');
        insertNeed.run(id, requester, provider, fingerprint, capability, mode, new Date().toISOString());
        persistOutbox(id, provider, 'NEED', delivery);
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
    transitionNeed({ id, requester, provider, to, delivery = null }) {
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
        if (to === 'completed') persistOutbox(id, row.requester, 'RESULT', delivery);
        else if (to === 'cancelled') persistOutbox(id, row.provider, 'REVOKE', delivery);
        else if (delivery != null) throw fault(400, 'invalid_lifecycle_delivery');
        return { changed: true, row: oneNeed.get(id) };
      });
    },
    acceptPartial({ id, provider, sequence, digest, delivery = null }) {
      if (!Number.isSafeInteger(sequence) || sequence < 0) throw fault(400, 'invalid_partial_sequence');
      return transaction(() => {
        const row = oneNeed.get(id);
        if (!row) throw fault(404, 'request_not_found');
        if (row.provider !== provider) throw fault(403, 'provider_mismatch');
        if (row.status !== 'matched') throw fault(409, row.status === 'cancelled' ? 'request_cancelled' : row.status === 'failed' ? 'request_failed' : 'request_already_completed');
        if (sequence === row.partial_sequence - 1 && digest === row.partial_digest) return { idempotent: true };
        if (sequence !== row.partial_sequence) throw fault(409, 'partial_sequence_mismatch');
        if (updatePartial.run(sequence + 1, digest, id, sequence).changes !== 1) throw fault(409, 'partial_sequence_mismatch');
        if (delivery != null) {
          if (delivery.event?.sequence !== sequence || delivery.event?.requestId !== id) throw fault(400, 'invalid_partial_delivery');
          persistOutbox(id, row.requester, 'PARTIAL', delivery);
        }
        return { idempotent: false, previousDigest: row.partial_digest };
      });
    },
    rollbackPartial({ id, sequence, digest, previousDigest = null }) {
      // Rollback is only valid in the legacy non-outbox path. A committed
      // PARTIAL outbox entry is durable and MUST NOT be rolled back.
      return transaction(() => {
        if (oneOutbox.get(`partial:${id}:${sequence}`)) return false;
        return rollbackPartial.run(sequence, previousDigest, id, sequence + 1, digest).changes === 1;
      });
    },
    beginEffect({ id, provider, requester, fingerprint }) {
      if (![id, provider, requester, fingerprint].every(x => typeof x === 'string' && x.length > 0)) throw fault(400, 'invalid_effect_intent');
      return transaction(() => {
        const existing = oneEffect.get(id);
        if (existing) return { acquired: false, existing };
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
