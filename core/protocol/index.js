import { createHash, randomBytes, randomUUID, sign as cryptoSign, verify as cryptoVerify, createPublicKey } from 'node:crypto';

export const PROTOCOL = 'TRUYN/1';
export const MVP_TYPES = Object.freeze(['IDENTITY', 'OFFER', 'NEED', 'RESULT', 'REVOKE']);
export const COMPACT_TYPES = Object.freeze(['NEED', 'RESULT', 'PARTIAL', 'CHAIN', 'CONTEXT_PUT', 'CONTEXT_DELTA']);

const COMPACT_TYPE_CODES = Object.freeze({ NEED: 'N', RESULT: 'R', PARTIAL: 'T', CHAIN: 'C', CONTEXT_PUT: 'P', CONTEXT_DELTA: 'D' });
const COMPACT_CODE_TYPES = Object.freeze({ N: 'NEED', R: 'RESULT', T: 'PARTIAL', C: 'CHAIN', P: 'CONTEXT_PUT', D: 'CONTEXT_DELTA' });

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key])])
    );
  }
  return value;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPayloadObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Only JSON scalar values are signable. Native JSON.stringify would silently turn
// NaN/Infinity into null and discard undefined members, changing the signed data.
function assertCanonicalJsonValue(value, visited = new Set()) {
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('TCJ1 non-finite number');
    return;
  }
  const checkUnicode = (text) => {
    for (let index = 0; index < text.length; index++) {
      const code = text.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = text.charCodeAt(++index);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError('TCJ1 unpaired surrogate');
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        throw new TypeError('TCJ1 unpaired surrogate');
      }
    }
  };
  if (typeof value === 'string') { checkUnicode(value); return; }
  if (typeof value !== 'object') throw new TypeError('TCJ1 requires JSON value');
  if (visited.has(value)) throw new TypeError('TCJ1 cyclic value');
  visited.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!(index in value)) throw new TypeError('TCJ1 sparse array');
      assertCanonicalJsonValue(value[index], visited);
    }
  } else {
    for (const key of Object.keys(value)) {
      checkUnicode(key);
      assertCanonicalJsonValue(value[key], visited);
    }
  }
  visited.delete(value);
}

function isRfc3339Timestamp(value) {
  if (!isNonEmptyString(value)) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  const utcTime = Date.parse(value);
  if (!Number.isFinite(utcTime)) return false;
  const zone = match[7];
  const hours = zone === 'Z' ? 0 : Number(zone.slice(1, 3));
  const minutes = zone === 'Z' ? 0 : Number(zone.slice(4, 6));
  if (hours > 23 || minutes > 59) return false;
  const offsetMinutes = zone === 'Z' ? 0 : (zone[0] === '+' ? 1 : -1) * (hours * 60 + minutes);
  // Reject normalized impossible calendar dates (e.g. February 30).
  const local = new Date(utcTime + offsetMinutes * 60000);
  return local.toISOString().slice(0, 19) === value.slice(0, 19);
}

export function canonicalize(value) {
  assertCanonicalJsonValue(value);
  return JSON.stringify(normalize(value));
}

// PEM parsing and SPKI export are pure for a given key and sit on hot identity
// verification paths. Keep a bounded exact memo so repeated signed records do not
// reparse the same public key thousands of times under D-500 load.
const FINGERPRINT_CACHE_LIMIT = 8_192;
const fingerprintCache = new Map();

export function publicKeyFingerprint(publicKeyPem) {
  const cacheKey = typeof publicKeyPem === 'string' ? publicKeyPem : null;
  if (cacheKey !== null) {
    const cached = fingerprintCache.get(cacheKey);
    if (cached !== undefined) return cached;
  }
  const key = createPublicKey(publicKeyPem);
  if (key.asymmetricKeyType !== 'ed25519') throw new TypeError('TRUYN/1 requires Ed25519 public keys');
  const der = key.export({ type: 'spki', format: 'der' });
  const fingerprint = createHash('sha256').update(der).digest('hex');
  if (cacheKey !== null) {
    if (fingerprintCache.size >= FINGERPRINT_CACHE_LIMIT) fingerprintCache.delete(fingerprintCache.keys().next().value);
    fingerprintCache.set(cacheKey, fingerprint);
  }
  return fingerprint;
}

export function nodeIdFromPublicKey(publicKeyPem) {
  return `truyn:node:${publicKeyFingerprint(publicKeyPem)}`;
}

export function unsignedEnvelope(envelope) {
  const { signature, ...unsigned } = envelope;
  return unsigned;
}

export function createEnvelope({ type, from, payload, privateKeyPem, publicKeyPem, to = null, id = randomUUID(), createdAt = new Date().toISOString() }) {
  if (!MVP_TYPES.includes(type)) {
    throw new Error(`Unsupported MVP message type: ${type}`);
  }
  if (!isNonEmptyString(from) || !isPayloadObject(payload) || !isNonEmptyString(privateKeyPem) || !isNonEmptyString(publicKeyPem)) {
    throw new Error('from, payload object, privateKeyPem and publicKeyPem are required');
  }
  if (!isNonEmptyString(id) || !isNonEmptyString(createdAt)) {
    throw new Error('id and createdAt are required');
  }
  if (!isRfc3339Timestamp(createdAt)) throw new Error('createdAt must be a valid RFC 3339 timestamp');
  if (to !== null && !isNonEmptyString(to)) {
    throw new Error('to must be null or a non-empty node ID');
  }

  const expectedNodeId = nodeIdFromPublicKey(publicKeyPem);
  if (expectedNodeId !== from) {
    throw new Error('Sender node ID does not match the supplied public key');
  }

  const unsigned = {
    protocol: PROTOCOL,
    type,
    id,
    from,
    to,
    createdAt,
    publicKey: publicKeyPem,
    payload
  };

  const signature = cryptoSign(null, Buffer.from(canonicalize(unsigned)), privateKeyPem).toString('base64');
  return { ...unsigned, signature };
}

export function verifyEnvelope(envelope, { allowedTypes = MVP_TYPES } = {}) {
  if (!envelope || envelope.protocol !== PROTOCOL) {
    return { ok: false, reason: 'unsupported_protocol' };
  }
  if (!allowedTypes.includes(envelope.type)) {
    return { ok: false, reason: 'unsupported_type' };
  }
  if (
    !isNonEmptyString(envelope.id) ||
    !isNonEmptyString(envelope.from) ||
    !isNonEmptyString(envelope.createdAt) ||
    !isNonEmptyString(envelope.publicKey) ||
    !isPayloadObject(envelope.payload) ||
    !isNonEmptyString(envelope.signature)
  ) {
    return { ok: false, reason: 'missing_required_field' };
  }
  if (envelope.to !== undefined && envelope.to !== null && !isNonEmptyString(envelope.to)) {
    return { ok: false, reason: 'invalid_optional_field' };
  }
  if (!isRfc3339Timestamp(envelope.createdAt)) {
    return { ok: false, reason: 'invalid_timestamp' };
  }
  // Buffer's Base64 decoder is permissive; the signed wire contract is not.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.signature)) {
    return { ok: false, reason: 'invalid_signature' };
  }
  const signature = Buffer.from(envelope.signature, 'base64');
  if (signature.length !== 64 || signature.toString('base64') !== envelope.signature) {
    return { ok: false, reason: 'invalid_signature' };
  }
  try {
    if (nodeIdFromPublicKey(envelope.publicKey) !== envelope.from) {
      return { ok: false, reason: 'node_id_key_mismatch' };
    }
    const unsigned = unsignedEnvelope(envelope);
    const ok = cryptoVerify(
      null,
      Buffer.from(canonicalize(unsigned)),
      envelope.publicKey,
      signature
    );
    return ok ? { ok: true } : { ok: false, reason: 'invalid_signature' };
  } catch {
    // An invalid public key, non-JSON value or invalid signature cannot dispatch.
    return { ok: false, reason: 'invalid_signature' };
  }
}

export function compactRequestId() {
  return randomBytes(12).toString('base64url');
}

export function compactStageRequestId(chainId, stageIndex) {
  if (!chainId || typeof chainId !== 'string') throw new Error('chainId is required');
  if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex > 35) throw new Error('stageIndex must be an integer between 0 and 35');
  return `${chainId.slice(0, 15)}${stageIndex.toString(36)}`;
}

export function compactType(frame) {
  return COMPACT_CODE_TYPES[frame?.t] || null;
}

function compactSigningValue(type, id, payload) {
  const code = COMPACT_TYPE_CODES[type];
  if (!code) throw new Error(`Unsupported compact message type: ${type}`);
  return [code, id, payload];
}

export function createCompactFrame({ type, payload, privateKeyPem, id = compactRequestId() }) {
  if (!COMPACT_TYPES.includes(type)) throw new Error(`Unsupported compact message type: ${type}`);
  if (!id || typeof id !== 'string' || !payload || !privateKeyPem) {
    throw new Error('id, payload and privateKeyPem are required for compact frames');
  }

  const code = COMPACT_TYPE_CODES[type];
  const signature = cryptoSign(
    null,
    Buffer.from(canonicalize(compactSigningValue(type, id, payload))),
    privateKeyPem
  ).toString('base64url');

  return { t: code, i: id, s: signature };
}

export function verifyCompactFrame(frame, payload, publicKeyPem, { allowedTypes = COMPACT_TYPES } = {}) {
  if (!frame || !frame.t || !frame.i || !frame.s || !payload || !publicKeyPem) {
    return { ok: false, reason: 'missing_required_field' };
  }
  const type = compactType(frame);
  if (!type || !allowedTypes.includes(type)) return { ok: false, reason: 'unsupported_type' };

  let signature;
  try {
    signature = Buffer.from(frame.s, 'base64url');
  } catch {
    return { ok: false, reason: 'invalid_signature_encoding' };
  }
  if (signature.length !== 64) return { ok: false, reason: 'invalid_signature_encoding' };

  const ok = cryptoVerify(
    null,
    Buffer.from(canonicalize(compactSigningValue(type, frame.i, payload))),
    publicKeyPem,
    signature
  );
  return ok ? { ok: true, type } : { ok: false, reason: 'invalid_signature' };
}

export function compactFrameBytes(frame) {
  return Buffer.byteLength(JSON.stringify(frame));
}
