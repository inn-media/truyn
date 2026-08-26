import { createHash } from 'node:crypto';

export const A2A_INTEGRITY_METADATA_KEY = 'io.truyn/integrity';
export const A2A_SOURCE_URL_METADATA_KEY = 'io.truyn/sourceUrl';
export const TRUYN_A2A_ARTIFACT_BUNDLE = 'io.truyn/a2a-artifact-bundle';
export const TRUYN_A2A_ARTIFACT_BUNDLE_VERSION = 1;

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_ARTIFACT_PARTS = 64;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function codedError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details !== null) error.details = structuredClone(details);
  return error;
}

function optionalString(value, name) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} must be a non-empty string when provided`);
  return value.trim();
}

function normalizeMetadata(value) {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) throw new Error('A2A Part metadata must be an object');
  return structuredClone(value);
}

function inlineMetadata(value) {
  const metadata = normalizeMetadata(value);
  delete metadata[A2A_SOURCE_URL_METADATA_KEY];
  return metadata;
}

function canonicalJsonValue(value, seen) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('A2A data Part must contain finite JSON numbers');
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') throw new Error('A2A data Part must contain JSON-compatible values');
  if (seen.has(value)) throw new Error('A2A data Part must not contain cycles');
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => canonicalJsonValue(item, seen));
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error('A2A data Part must contain plain JSON objects');
    const normalized = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      Object.defineProperty(normalized, key, {
        value: canonicalJsonValue(value[key], seen),
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    return normalized;
  } finally {
    seen.delete(value);
  }
}

export function canonicalA2aJson(value) {
  return JSON.stringify(canonicalJsonValue(value, new Set()));
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function computeIntegrity(bytes, encoding) {
  return {
    algorithm: 'sha256',
    digest: sha256(bytes),
    sizeBytes: bytes.length,
    encoding,
    verified: true
  };
}

function normalizeIntegrityClaim(metadata, { required = false } = {}) {
  const claim = metadata[A2A_INTEGRITY_METADATA_KEY];
  if (claim === undefined || claim === null) {
    if (required) throw codedError('A2A_ARTIFACT_INTEGRITY_REQUIRED', 'A2A file URL requires io.truyn/integrity metadata');
    return null;
  }
  if (!isObject(claim)) throw codedError('A2A_ARTIFACT_INTEGRITY_INVALID', 'io.truyn/integrity must be an object');
  if (String(claim.algorithm || '').toLowerCase() !== 'sha256') {
    throw codedError('A2A_ARTIFACT_INTEGRITY_INVALID', 'io.truyn/integrity algorithm must be sha256');
  }
  if (typeof claim.digest !== 'string' || !SHA256_HEX.test(claim.digest)) {
    throw codedError('A2A_ARTIFACT_INTEGRITY_INVALID', 'io.truyn/integrity digest must be a 64-character SHA-256 hex string');
  }
  if (!Number.isSafeInteger(claim.sizeBytes) || claim.sizeBytes < 0) {
    throw codedError('A2A_ARTIFACT_INTEGRITY_INVALID', 'io.truyn/integrity sizeBytes must be a non-negative safe integer');
  }
  if (claim.encoding !== undefined && (typeof claim.encoding !== 'string' || claim.encoding.length === 0)) {
    throw codedError('A2A_ARTIFACT_INTEGRITY_INVALID', 'io.truyn/integrity encoding must be a non-empty string when provided');
  }
  if (claim.verified !== undefined && typeof claim.verified !== 'boolean') {
    throw codedError('A2A_ARTIFACT_INTEGRITY_INVALID', 'io.truyn/integrity verified must be boolean when provided');
  }
  return {
    algorithm: 'sha256',
    digest: claim.digest.toLowerCase(),
    sizeBytes: claim.sizeBytes,
    ...(claim.encoding ? { encoding: claim.encoding } : {}),
    ...(claim.verified !== undefined ? { verified: claim.verified } : {})
  };
}

function verifyIntegrityClaim(claim, computed) {
  if (!claim) return;
  if (claim.digest !== computed.digest || claim.sizeBytes !== computed.sizeBytes || (claim.encoding && claim.encoding !== computed.encoding)) {
    throw codedError('A2A_ARTIFACT_INTEGRITY_MISMATCH', 'A2A Part content does not match io.truyn/integrity metadata', {
      expected: claim,
      actual: computed
    });
  }
}

function attachMetadata(part, metadata, integrity, extra = {}) {
  const nextMetadata = {
    ...metadata,
    ...extra,
    [A2A_INTEGRITY_METADATA_KEY]: integrity
  };
  return { ...part, metadata: nextMetadata };
}

function strictBase64Bytes(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !BASE64.test(value)) {
    throw codedError('A2A_ARTIFACT_RAW_INVALID', 'A2A raw Part must contain canonical base64 bytes');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw codedError('A2A_ARTIFACT_RAW_INVALID', 'A2A raw Part must contain canonical base64 bytes');
  return bytes;
}

function enforceBytes(bytes, maxArtifactBytes) {
  if (bytes.length > maxArtifactBytes) {
    throw codedError('A2A_ARTIFACT_TOO_LARGE', `A2A artifact Part exceeds maxArtifactBytes (${maxArtifactBytes})`, {
      sizeBytes: bytes.length,
      maxArtifactBytes
    });
  }
}

function enforceClaimBytes(claim, maxArtifactBytes) {
  if (claim?.sizeBytes > maxArtifactBytes) {
    throw codedError('A2A_ARTIFACT_TOO_LARGE', `A2A artifact reference exceeds maxArtifactBytes (${maxArtifactBytes})`, {
      sizeBytes: claim.sizeBytes,
      maxArtifactBytes
    });
  }
}

function validateByteBudget(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('maxArtifactBytes must be a non-negative safe integer');
}

function partShape(part) {
  if (!isObject(part)) throw new Error('A2A Part must be an object');
  const fields = ['text', 'data', 'url', 'raw'].filter((key) => Object.prototype.hasOwnProperty.call(part, key));
  if (fields.length !== 1) throw new Error('A2A Part must contain exactly one of text, data, url, raw');
  return fields[0];
}

function basePartFields(part) {
  const normalized = {};
  const filename = optionalString(part.filename, 'A2A Part filename');
  const mediaType = optionalString(part.mediaType, 'A2A Part mediaType');
  if (filename) normalized.filename = filename;
  if (mediaType) normalized.mediaType = mediaType;
  return normalized;
}

function normalizedAbsoluteUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error('A2A URL Part requires a non-empty url');
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('A2A URL Part requires an absolute URL');
  }
  if (!url.protocol) throw new Error('A2A URL Part requires an absolute URL');
  return url.toString();
}

function normalizeResolvedBytes(value) {
  const source = isObject(value) && Object.prototype.hasOwnProperty.call(value, 'bytes') ? value.bytes : value;
  if (Buffer.isBuffer(source)) return Buffer.from(source);
  if (source instanceof Uint8Array) return Buffer.from(source);
  if (source instanceof ArrayBuffer) return Buffer.from(new Uint8Array(source));
  throw codedError('A2A_ARTIFACT_URL_RESOLVER_INVALID', 'A2A artifact URL resolver must return Buffer, Uint8Array, ArrayBuffer, or { bytes }');
}

export function partIntegrity(part) {
  if (!isObject(part) || !isObject(part.metadata)) return null;
  const value = part.metadata[A2A_INTEGRITY_METADATA_KEY];
  return isObject(value) ? structuredClone(value) : null;
}

export async function normalizeVerifiedRemotePart(part, {
  maxArtifactBytes,
  resolveArtifactUrl = null
} = {}) {
  validateByteBudget(maxArtifactBytes);
  if (resolveArtifactUrl !== null && resolveArtifactUrl !== undefined && typeof resolveArtifactUrl !== 'function') {
    throw new Error('resolveArtifactUrl must be a function when provided');
  }

  const kind = partShape(part);
  const metadata = kind === 'url' ? normalizeMetadata(part.metadata) : inlineMetadata(part.metadata);
  const base = basePartFields(part);
  const claim = normalizeIntegrityClaim(metadata);

  if (kind === 'text') {
    if (typeof part.text !== 'string') throw new Error('A2A text Part requires string text');
    const bytes = Buffer.from(part.text, 'utf8');
    enforceBytes(bytes, maxArtifactBytes);
    const integrity = computeIntegrity(bytes, 'utf8');
    verifyIntegrityClaim(claim, integrity);
    return attachMetadata({ text: part.text, ...base }, metadata, integrity);
  }

  if (kind === 'data') {
    const canonical = canonicalA2aJson(part.data);
    const bytes = Buffer.from(canonical, 'utf8');
    enforceBytes(bytes, maxArtifactBytes);
    const integrity = computeIntegrity(bytes, 'truyn-json-c14n-v1');
    verifyIntegrityClaim(claim, integrity);
    return attachMetadata({ data: structuredClone(part.data), ...base }, metadata, integrity);
  }

  if (kind === 'raw') {
    const bytes = strictBase64Bytes(part.raw);
    enforceBytes(bytes, maxArtifactBytes);
    const integrity = computeIntegrity(bytes, 'raw');
    verifyIntegrityClaim(claim, integrity);
    return attachMetadata({ raw: bytes.toString('base64'), ...base }, metadata, integrity);
  }

  const url = normalizedAbsoluteUrl(part.url);
  if (!resolveArtifactUrl) {
    throw codedError('A2A_ARTIFACT_URL_UNVERIFIED', 'A2A URL Part requires an explicit resolveArtifactUrl hook before it can enter a verified TRUYN RESULT', { url });
  }
  enforceClaimBytes(claim, maxArtifactBytes);
  if (maxArtifactBytes === 0 && (!claim || claim.sizeBytes !== 0)) {
    throw codedError('A2A_ARTIFACT_TOO_LARGE', 'A2A URL Part cannot be resolved with an exhausted artifact byte budget', {
      maxArtifactBytes
    });
  }
  const resolved = await resolveArtifactUrl({
    url,
    part: structuredClone(part),
    maxBytes: maxArtifactBytes
  });
  const bytes = normalizeResolvedBytes(resolved);
  enforceBytes(bytes, maxArtifactBytes);
  const integrity = computeIntegrity(bytes, 'raw');
  verifyIntegrityClaim(claim, integrity);
  return attachMetadata(
    { raw: bytes.toString('base64'), ...base },
    metadata,
    integrity,
    { [A2A_SOURCE_URL_METADATA_KEY]: url }
  );
}

export function normalizeOutboundA2aPart(part, { maxArtifactBytes } = {}) {
  validateByteBudget(maxArtifactBytes);
  const kind = partShape(part);
  const metadata = kind === 'url' ? normalizeMetadata(part.metadata) : inlineMetadata(part.metadata);
  const base = basePartFields(part);
  const claim = normalizeIntegrityClaim(metadata, { required: kind === 'url' });

  if (kind === 'text') {
    if (typeof part.text !== 'string') throw new Error('A2A text Part requires string text');
    const bytes = Buffer.from(part.text, 'utf8');
    enforceBytes(bytes, maxArtifactBytes);
    const integrity = computeIntegrity(bytes, 'utf8');
    verifyIntegrityClaim(claim, integrity);
    return attachMetadata({ text: part.text, ...base }, metadata, integrity);
  }
  if (kind === 'data') {
    const bytes = Buffer.from(canonicalA2aJson(part.data), 'utf8');
    enforceBytes(bytes, maxArtifactBytes);
    const integrity = computeIntegrity(bytes, 'truyn-json-c14n-v1');
    verifyIntegrityClaim(claim, integrity);
    return attachMetadata({ data: structuredClone(part.data), ...base }, metadata, integrity);
  }
  if (kind === 'raw') {
    const bytes = strictBase64Bytes(part.raw);
    enforceBytes(bytes, maxArtifactBytes);
    const integrity = computeIntegrity(bytes, 'raw');
    verifyIntegrityClaim(claim, integrity);
    return attachMetadata({ raw: bytes.toString('base64'), ...base }, metadata, integrity);
  }

  const url = normalizedAbsoluteUrl(part.url);
  if (claim.verified !== true) {
    throw codedError('A2A_ARTIFACT_URL_UNVERIFIED', 'Outbound A2A URL Part requires io.truyn/integrity.verified=true');
  }
  enforceClaimBytes(claim, maxArtifactBytes);
  return attachMetadata({ url, ...base }, metadata, { ...claim, verified: true });
}

function normalizeArtifactFields(artifact) {
  if (!isObject(artifact)) throw new Error('A2A Artifact must be an object');
  const artifactId = optionalString(artifact.artifactId, 'A2A Artifact artifactId');
  if (!artifactId) throw new Error('A2A Artifact requires artifactId');
  if (!Array.isArray(artifact.parts) || artifact.parts.length < 1 || artifact.parts.length > MAX_ARTIFACT_PARTS) {
    throw new Error(`A2A Artifact parts must contain between 1 and ${MAX_ARTIFACT_PARTS} entries`);
  }
  const normalized = { artifactId };
  const name = optionalString(artifact.name, 'A2A Artifact name');
  const description = optionalString(artifact.description, 'A2A Artifact description');
  if (name) normalized.name = name;
  if (description) normalized.description = description;
  if (artifact.metadata !== undefined) {
    if (!isObject(artifact.metadata)) throw new Error('A2A Artifact metadata must be an object');
    normalized.metadata = structuredClone(artifact.metadata);
  }
  if (artifact.extensions !== undefined) {
    if (!Array.isArray(artifact.extensions) || artifact.extensions.some((value) => typeof value !== 'string' || value.length === 0)) {
      throw new Error('A2A Artifact extensions must be an array of non-empty strings');
    }
    normalized.extensions = [...artifact.extensions];
  }
  return normalized;
}

export async function normalizeVerifiedRemoteArtifact(artifact, options) {
  const normalized = normalizeArtifactFields(artifact);
  normalized.parts = [];
  let remaining = options?.maxArtifactBytes;
  validateByteBudget(remaining);
  for (const part of artifact.parts) {
    const normalizedPart = await normalizeVerifiedRemotePart(part, { ...options, maxArtifactBytes: remaining });
    const sizeBytes = partIntegrity(normalizedPart)?.sizeBytes || 0;
    remaining -= sizeBytes;
    if (remaining < 0) throw codedError('A2A_ARTIFACT_TOO_LARGE', 'A2A artifact exceeds aggregate maxArtifactBytes');
    normalized.parts.push(normalizedPart);
  }
  return normalized;
}

export function normalizeOutboundA2aArtifact(artifact, options) {
  const normalized = normalizeArtifactFields(artifact);
  let remaining = options?.maxArtifactBytes;
  validateByteBudget(remaining);
  normalized.parts = artifact.parts.map((part) => {
    const normalizedPart = normalizeOutboundA2aPart(part, { ...options, maxArtifactBytes: remaining });
    const sizeBytes = partIntegrity(normalizedPart)?.sizeBytes || 0;
    remaining -= sizeBytes;
    if (remaining < 0) throw codedError('A2A_ARTIFACT_TOO_LARGE', 'A2A artifact exceeds aggregate maxArtifactBytes');
    return normalizedPart;
  });
  return normalized;
}

export function createA2aArtifactBundle(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) throw new Error('A2A artifact bundle requires at least one artifact');
  return {
    $truyn: {
      type: TRUYN_A2A_ARTIFACT_BUNDLE,
      version: TRUYN_A2A_ARTIFACT_BUNDLE_VERSION
    },
    artifacts: structuredClone(artifacts)
  };
}

export function isA2aArtifactBundle(value) {
  return isObject(value)
    && isObject(value.$truyn)
    && value.$truyn.type === TRUYN_A2A_ARTIFACT_BUNDLE
    && value.$truyn.version === TRUYN_A2A_ARTIFACT_BUNDLE_VERSION
    && Array.isArray(value.artifacts);
}

export function normalizeOutboundA2aArtifactBundle(value, options) {
  if (!isA2aArtifactBundle(value) || value.artifacts.length === 0) throw new Error('Invalid TRUYN A2A artifact bundle');
  const totalParts = value.artifacts.reduce((count, artifact) => count + (Array.isArray(artifact?.parts) ? artifact.parts.length : 0), 0);
  if (totalParts > MAX_ARTIFACT_PARTS) {
    throw codedError('A2A_ARTIFACT_COLLECTION_TOO_LARGE', `A2A artifact bundle exceeds ${MAX_ARTIFACT_PARTS} total parts`);
  }
  let remaining = options?.maxArtifactBytes;
  validateByteBudget(remaining);
  const seen = new Set();
  const artifacts = value.artifacts.map((artifact) => {
    const normalized = normalizeOutboundA2aArtifact(artifact, { ...options, maxArtifactBytes: remaining });
    if (seen.has(normalized.artifactId)) throw new Error(`Duplicate A2A artifactId in bundle: ${normalized.artifactId}`);
    seen.add(normalized.artifactId);
    const artifactBytes = normalized.parts.reduce((total, part) => total + (partIntegrity(part)?.sizeBytes || 0), 0);
    remaining -= artifactBytes;
    if (remaining < 0) throw codedError('A2A_ARTIFACT_TOO_LARGE', 'A2A artifact bundle exceeds aggregate maxArtifactBytes');
    return normalized;
  });
  return createA2aArtifactBundle(artifacts);
}
