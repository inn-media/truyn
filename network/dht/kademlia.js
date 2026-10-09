import { createHash } from 'node:crypto';
import { signValue, verifyValue } from '../../core/identity/index.js';
import { canonicalize, nodeIdFromPublicKey } from '../../core/protocol/index.js';

export const KADEMLIA_PROTOCOL = 'truyn-kademlia-v1';
export const KADEMLIA_ID_BITS = 256;

const DHT_KEY_CACHE_LIMIT = 16_384;
const dhtIdCache = new Map();
const dhtKeyCache = new Map();

function remember(cache, key, value) {
  if (cache.size >= DHT_KEY_CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
}

export const dhtId = (value) => {
  const key = String(value);
  const cached = dhtIdCache.get(key);
  return cached !== undefined ? cached : remember(dhtIdCache, key, createHash('sha256').update(key).digest('hex'));
};

export const dhtKey = (value) => {
  const key = String(value);
  const cached = dhtKeyCache.get(key);
  return cached !== undefined ? cached : remember(dhtKeyCache, key, BigInt(`0x${dhtId(key)}`));
};

export const xorDistance = (left, right) => dhtKey(left) ^ dhtKey(right);

function bucketIndex(localId, peerId) {
  const distance = xorDistance(localId, peerId);
  if (distance === 0n) return -1;
  return distance.toString(2).length - 1;
}

export class KademliaRoutingTable {
  constructor({ localNodeId, k = 20 } = {}) {
    if (!localNodeId) throw new Error('localNodeId is required');
    if (!Number.isInteger(k) || k < 1) throw new Error('k must be >= 1');
    this.localNodeId = localNodeId;
    this.k = k;
    this.buckets = Array.from({ length: KADEMLIA_ID_BITS }, () => []);
    this.members = new Set();
  }

  has(nodeId) { return this.members.has(nodeId); }

  upsert(peer) {
    if (!peer?.nodeId || peer.nodeId === this.localNodeId) return false;
    const index = bucketIndex(this.localNodeId, peer.nodeId);
    if (index < 0) return false;
    const bucket = this.buckets[index];
    const existing = bucket.findIndex((item) => item.nodeId === peer.nodeId);
    if (existing >= 0) bucket.splice(existing, 1);
    bucket.push({ ...peer, lastSeenAt: peer.lastSeenAt || new Date().toISOString() });
    this.members.add(peer.nodeId);
    if (bucket.length > this.k) this.members.delete(bucket.shift().nodeId);
    return true;
  }

  remove(nodeId) {
    const index = bucketIndex(this.localNodeId, nodeId);
    if (index < 0) return false;
    const before = this.buckets[index].length;
    this.buckets[index] = this.buckets[index].filter((item) => item.nodeId !== nodeId);
    const removed = this.buckets[index].length !== before;
    if (removed) this.members.delete(nodeId);
    return removed;
  }

  closest(target, count = this.k) {
    const limit = Math.max(0, count);
    if (limit === 0) return [];
    const targetKey = dhtKey(target);
    const ranked = [];
    for (const bucket of this.buckets) {
      for (const peer of bucket) ranked.push({ peer, distance: dhtKey(peer.nodeId) ^ targetKey });
    }
    ranked.sort((a, b) => (a.distance < b.distance ? -1 : a.distance > b.distance ? 1 : a.peer.nodeId.localeCompare(b.peer.nodeId)));
    const selected = ranked.length > limit ? ranked.slice(0, limit) : ranked;
    return selected.map(({ peer }) => ({ ...peer }));
  }

  routingSnapshot() {
    const bucketOccupancy = this.buckets.map((bucket, index) => ({ index, count: bucket.length }));
    const peers = this.buckets.flat();
    const validPeers = peers.filter((peer) => (
      peer?.nodeId &&
      peer.nodeId !== this.localNodeId &&
      Array.isArray(peer.endpoints) &&
      peer.endpoints.length > 0
    )).length;

    return {
      localNodeId: this.localNodeId,
      k: this.k,
      bucketCount: KADEMLIA_ID_BITS,
      routingSize: peers.length,
      validPeers,
      populatedBuckets: bucketOccupancy.filter((bucket) => bucket.count > 0).length,
      bucketOccupancy
    };
  }

  snapshot() { return this.buckets.flat().map((peer) => ({ ...peer })); }
  restore(peers = []) { for (const peer of peers) this.upsert(peer); return this.size(); }
  size() { return this.members.size; }
}

function assertIdentity(identity) {
  if (!identity?.nodeId || !identity?.publicKeyPem || !identity?.privateKeyPem) throw new Error('DHT publisher identity is required');
  if (nodeIdFromPublicKey(identity.publicKeyPem) !== identity.nodeId) throw new Error('DHT publisher identity mismatch');
}

export function createDhtRecord({ identity, namespace, key, value, sequence = 1, ttlMs = 300_000, issuedAt = new Date().toISOString() } = {}) {
  assertIdentity(identity);
  if (!namespace || !key) throw new Error('DHT namespace and key are required');
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error('DHT sequence must be >= 1');
  if (!Number.isInteger(ttlMs) || ttlMs < 1) throw new Error('DHT ttlMs must be >= 1');
  const expiresAt = new Date(Date.parse(issuedAt) + ttlMs).toISOString();
  const body = {
    protocol: KADEMLIA_PROTOCOL,
    namespace,
    key,
    keyHash: dhtId(`${namespace}:${key}`),
    value,
    valueDigest: `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`,
    publisherNodeId: identity.nodeId,
    sequence,
    issuedAt,
    expiresAt
  };
  const recordId = `truyn:dht:${createHash('sha256').update(canonicalize(body)).digest('hex')}`;
  const signed = { recordId, ...body };
  return { ...signed, publicKey: identity.publicKeyPem, signature: signValue(signed, identity.privateKeyPem) };
}

const VERIFIED_DHT_SIGNATURE_LIMIT = 8_192;
const verifiedDhtSignatures = new Map();

export function verifyDhtRecord(record, { now = Date.now(), allowExpired = false } = {}) {
  try {
    if (!record?.recordId || record.protocol !== KADEMLIA_PROTOCOL || !record.publicKey || !record.signature) return { ok: false, reason: 'dht_record_missing' };
    if (nodeIdFromPublicKey(record.publicKey) !== record.publisherNodeId) return { ok: false, reason: 'dht_publisher_key_mismatch' };
    if (record.keyHash !== dhtId(`${record.namespace}:${record.key}`)) return { ok: false, reason: 'dht_key_hash_mismatch' };
    const valueDigest = `sha256:${createHash('sha256').update(canonicalize(record.value)).digest('hex')}`;
    if (valueDigest !== record.valueDigest) return { ok: false, reason: 'dht_value_digest_mismatch' };
    const { publicKey, signature, ...signed } = record;
    const { recordId, ...body } = signed;
    const expectedId = `truyn:dht:${createHash('sha256').update(canonicalize(body)).digest('hex')}`;
    if (record.recordId !== expectedId) return { ok: false, reason: 'dht_record_id_mismatch' };
    const signatureKey = `${recordId}\n${publicKey}\n${signature}`;
    if (!verifiedDhtSignatures.has(signatureKey)) {
      if (!verifyValue(signed, signature, publicKey)) return { ok: false, reason: 'dht_record_signature' };
      if (verifiedDhtSignatures.size >= VERIFIED_DHT_SIGNATURE_LIMIT) verifiedDhtSignatures.delete(verifiedDhtSignatures.keys().next().value);
      verifiedDhtSignatures.set(signatureKey, true);
    }
    const issued = Date.parse(record.issuedAt);
    const expires = Date.parse(record.expiresAt);
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued) return { ok: false, reason: 'dht_record_time' };
    if (!allowExpired && now >= expires) return { ok: false, reason: 'dht_record_expired' };
    return { ok: true, recordId: record.recordId };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export class KademliaRecordStore {
  constructor({ onChange = null } = {}) { this.records = new Map(); this.onChange = onChange; }

  put(record, options = {}) {
    const { notify = true, ...verifyOptions } = options;
    const verification = verifyDhtRecord(record, verifyOptions);
    if (!verification.ok) return { accepted: false, reason: verification.reason };
    const key = `${record.namespace}:${record.key}:${record.publisherNodeId}`;
    const existing = this.records.get(key);
    if (existing && existing.sequence > record.sequence) return { accepted: false, reason: 'dht_older_sequence' };
    if (existing && existing.sequence === record.sequence && existing.recordId !== record.recordId) return { accepted: false, reason: 'dht_equivocation' };
    this.records.set(key, structuredClone(record));
    if (notify) this.onChange?.();
    return { accepted: true, recordId: record.recordId };
  }

  get(namespace, key, { now = Date.now() } = {}) {
    return [...this.records.values()]
      .filter((record) => record.namespace === namespace && record.key === key && verifyDhtRecord(record, { now }).ok)
      .sort((a, b) => b.sequence - a.sequence || a.publisherNodeId.localeCompare(b.publisherNodeId))
      .map((record) => structuredClone(record));
  }

  snapshot({ now = Date.now() } = {}) {
    return [...this.records.values()].filter((record) => verifyDhtRecord(record, { now }).ok).map((record) => structuredClone(record));
  }

  restore(records = [], options = {}) {
    let accepted = 0;
    for (const record of records) if (this.put(record, { ...options, notify: false }).accepted) accepted += 1;
    return accepted;
  }

  sweep({ now = Date.now(), notify = true } = {}) {
    let removed = 0;
    for (const [key, record] of this.records) {
      if (!verifyDhtRecord(record, { now }).ok) { this.records.delete(key); removed += 1; }
    }
    if (removed && notify) this.onChange?.();
    return removed;
  }
}