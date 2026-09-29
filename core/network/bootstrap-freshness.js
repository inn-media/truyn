import { parseBootstrapManifest } from './bootstrap-manifest.js';

function time(value, field) {
  const parsed = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid time`);
  return parsed;
}

function version(value, field) {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${field} must be a positive safe integer`);
  return value;
}

export function enforceBootstrapFreshness(input, options = {}) {
  const manifest = parseBootstrapManifest(input);
  const now = time(options.now ?? Date.now(), 'now');
  const issuedAt = time(manifest.issuedAt, 'issuedAt');
  const expiresAt = time(manifest.expiresAt, 'expiresAt');
  if (now < issuedAt) throw new Error('bootstrap manifest is not active yet');
  if (now >= expiresAt) throw new Error('bootstrap manifest is expired');

  const minimumVersion = version(options.minimumVersion, 'minimumVersion');
  if (minimumVersion != null && manifest.version < minimumVersion) throw new Error('bootstrap manifest downgrade rejected');

  const { activeKeyId, nextKeyId, notBefore } = manifest.rotation;
  if ((nextKeyId == null) !== (notBefore == null)) throw new Error('bootstrap rotation nextKeyId and notBefore must be declared together');
  if (nextKeyId != null && nextKeyId === activeKeyId) throw new Error('bootstrap rotation keys must differ');
  if (notBefore != null) {
    const rotationAt = time(notBefore, 'rotation.notBefore');
    if (rotationAt <= issuedAt || rotationAt >= expiresAt) throw new Error('bootstrap rotation overlap must be inside manifest lifetime');
  }

  return Object.freeze({ manifest, acceptedKeyIds: Object.freeze(nextKeyId == null ? [activeKeyId] : [activeKeyId, nextKeyId]) });
}
