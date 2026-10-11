import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Strict, bounded TRUYN/1 referenced-object integrity profile.
 * A reference is descriptive data: it never gives fetch, execution, tenant or billing authority.
 * Unlike legacy interoperability mappings, this verified profile requires BOTH a claimed
 * SHA-256 digest and an exact byte size before any resolver is invoked.
 */
export const OBJECT_REFERENCE_PROFILE = 'truyn.object-reference-integrity/1';
export const DEFAULT_OBJECT_MAX_BYTES = 16 * 1024 * 1024;
const SHA256 = /^[a-fA-F0-9]{64}$/;

function reject(code, reason) {
  const error = new Error(reason);
  error.code = code;
  throw error;
}

function boundedLimit(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    reject('OBJECT_INVALID_BOUND', 'maxBytes must be a non-negative safe integer');
  }
  return value;
}

function byteView(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
  reject('OBJECT_INVALID_BYTES', 'object bytes must be Buffer, Uint8Array or ArrayBuffer');
}

/**
 * SDK payloads use bytes/sha256; bounded A2A integrity claims use sizeBytes/digest.
 * Both spellings are allowed ONLY if their values agree, so aliases cannot conceal
 * conflicting integrity claims. Protobuf ContentObject uses size_bytes + raw digest bytes.
 */
export function normalizeVerifiedObjectReference(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    reject('OBJECT_INVALID_REFERENCE', 'verified object reference must be an object');
  }
  const ref = input.ref;
  if (typeof ref !== 'string' || ref.trim().length === 0) {
    reject('OBJECT_INVALID_REFERENCE', 'non-empty opaque ref is required');
  }
  if (input.kind !== undefined && input.kind !== 'artifact' && input.kind !== 'object') {
    reject('OBJECT_INVALID_REFERENCE', 'unsupported referenced object kind');
  }
  const bytes = input.bytes ?? input.sizeBytes;
  if (input.bytes !== undefined && input.sizeBytes !== undefined && input.bytes !== input.sizeBytes) {
    reject('OBJECT_INVALID_REFERENCE', 'conflicting byte-size aliases');
  }
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    reject('OBJECT_INTEGRITY_REQUIRED', 'exact non-negative byte size is required');
  }
  const digest = input.sha256 ?? input.digest;
  if (input.sha256 !== undefined && input.digest !== undefined &&
      String(input.sha256).toLowerCase() !== String(input.digest).toLowerCase()) {
    reject('OBJECT_INVALID_REFERENCE', 'conflicting digest aliases');
  }
  if (typeof digest !== 'string' || !SHA256.test(digest)) {
    reject('OBJECT_INTEGRITY_REQUIRED', '64-character SHA-256 digest is required');
  }
  if (input.algorithm !== undefined && input.algorithm !== 'sha256') {
    reject('OBJECT_INVALID_REFERENCE', 'unsupported digest algorithm');
  }
  const mediaType = input.mediaType ?? input.contentType;
  if (mediaType !== undefined && (typeof mediaType !== 'string' || mediaType.trim().length === 0)) {
    reject('OBJECT_INVALID_REFERENCE', 'media type must be non-empty when present');
  }
  return Object.freeze({
    ref,
    bytes,
    sha256: digest.toLowerCase(),
    ...(mediaType === undefined ? {} : { mediaType })
  });
}

/**
 * Verify exact final bytes of an immutable object (single buffer or ordered chunks).
 * This never initiates IO; callers must explicitly materialize any referenced chunks.
 */
export function verifyImmutableObjectBytes(reference, source, { maxBytes = DEFAULT_OBJECT_MAX_BYTES } = {}) {
  const bound = boundedLimit(maxBytes);
  const claim = normalizeVerifiedObjectReference(reference);
  if (claim.bytes > bound) {
    reject('OBJECT_TOO_LARGE', 'declared object exceeds maxBytes');
  }
  const chunks = Array.isArray(source) ? source : [source];
  let total = 0;
  const parts = [];
  for (const item of chunks) {
    const part = byteView(item);
    total += part.length;
    if (!Number.isSafeInteger(total) || total > bound) {
      reject('OBJECT_TOO_LARGE', 'materialized object exceeds maxBytes');
    }
    parts.push(part);
  }
  if (total !== claim.bytes) {
    reject('OBJECT_INTEGRITY_MISMATCH', 'materialized byte size differs from declared size');
  }
  const bytes = Buffer.concat(parts, total);
  const actual = Buffer.from(createHash('sha256').update(bytes).digest('hex'), 'hex');
  const expected = Buffer.from(claim.sha256, 'hex');
  if (!timingSafeEqual(actual, expected)) {
    reject('OBJECT_INTEGRITY_MISMATCH', 'materialized SHA-256 differs from declared digest');
  }
  return Object.freeze({ reference: claim, bytes, verified: true });
}

/**
 * The ONLY IO-capable path in this strict profile. Resolver is injected by the
 * authorized application and must return exact bytes; no URL/file/MCP/A2A fetch
 * happens implicitly, and no fallback or retry is attempted on failure.
 */
export async function resolveVerifiedObjectReference(reference, {
  resolve = null,
  maxBytes = DEFAULT_OBJECT_MAX_BYTES
} = {}) {
  const bound = boundedLimit(maxBytes);
  const claim = normalizeVerifiedObjectReference(reference);
  if (claim.bytes > bound) reject('OBJECT_TOO_LARGE', 'declared object exceeds maxBytes');
  if (typeof resolve !== 'function') {
    reject('OBJECT_RESOLVER_REQUIRED', 'explicit authorized object resolver is required');
  }
  const result = await resolve({ ref: claim.ref, maxBytes: bound, reference: claim });
  const raw = result && typeof result === 'object' && !ArrayBuffer.isView(result) &&
    !(result instanceof ArrayBuffer) && Object.hasOwn(result, 'bytes') ? result.bytes : result;
  return verifyImmutableObjectBytes(claim, raw, { maxBytes: bound });
}
