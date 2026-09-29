import { sign, verify } from 'node:crypto';
import { parseBootstrapManifest } from './bootstrap-manifest.js';

function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('bootstrap manifest canonical form requires safe integers');
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  throw new Error('bootstrap manifest contains non-canonical value');
}

export function canonicalBootstrapManifestBytes(input) {
  const manifest = parseBootstrapManifest(input);
  return Buffer.from(canonical(manifest), 'utf8');
}

export function signBootstrapManifest(input, privateKey) {
  if (!privateKey) throw new Error('bootstrap signing private key is required');
  return sign(null, canonicalBootstrapManifestBytes(input), privateKey).toString('base64');
}

export function verifyBootstrapManifest(input, signature, publicKey) {
  if (typeof signature !== 'string' || signature.length === 0) return false;
  if (!publicKey) return false;
  try {
    const bytes = canonicalBootstrapManifestBytes(input);
    return verify(null, bytes, publicKey, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}
