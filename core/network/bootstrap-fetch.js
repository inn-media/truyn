import { selectNetworkProfile } from './profiles.js';
import { verifyBootstrapManifest } from './bootstrap-signing.js';
import { enforceBootstrapFreshness } from './bootstrap-freshness.js';

const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 10_000;

function httpsUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') throw new Error('bootstrap manifest URL must use HTTPS');
  if (parsed.username || parsed.password) throw new Error('bootstrap manifest URL credentials are forbidden');
  return parsed;
}

function publicKeyFor(publicKeys, keyId) {
  if (!publicKeys || typeof publicKeys !== 'object') return null;
  if (publicKeys instanceof Map) return publicKeys.get(keyId) ?? null;
  return publicKeys[keyId] ?? null;
}

function trustedKeyIds(trustedRotation, now) {
  if (!trustedRotation || typeof trustedRotation !== 'object') throw new Error('trusted bootstrap rotation state is required');
  const ids = [trustedRotation.activeKeyId];
  if (!ids[0]) throw new Error('trusted active bootstrap key is required');
  if (trustedRotation.nextKeyId && trustedRotation.notBefore && Date.parse(now) >= Date.parse(trustedRotation.notBefore)) ids.push(trustedRotation.nextKeyId);
  return ids;
}

async function boundedJson(response, maxBytes) {
  const length = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(length) && length > maxBytes) throw new Error('bootstrap manifest body exceeds byte limit');
  if (!response.body?.getReader) throw new Error('bootstrap manifest response must provide a bounded readable body');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error('bootstrap manifest body exceeds byte limit');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function fetchVerifiedBootstrapManifest({ profile, url, publicKeys, trustedRotation, minimumVersion, now = new Date().toISOString(), fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES, signal } = {}) {
  const selected = selectNetworkProfile(profile);
  if (!selected.bootstrapRequired) return Object.freeze({ profile: selected.name, peers: Object.freeze([]), manifest: null });
  if (typeof fetchImpl !== 'function') throw new Error('bootstrap HTTPS fetch implementation is required');
  if (!Number.isSafeInteger(minimumVersion) || minimumVersion < 1) throw new Error('trusted bootstrap minimumVersion is required');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('bootstrap timeoutMs must be positive');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('bootstrap maxBytes must be positive');
  const target = httpsUrl(url);
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal?.aborted) controller.abort(signal.reason); else signal?.addEventListener?.('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('bootstrap manifest fetch timed out')), timeoutMs);
  try {
    const response = await fetchImpl(target, { method: 'GET', headers: { accept: 'application/json' }, redirect: 'error', signal: controller.signal });
    if (!response || response.ok !== true) throw new Error(`bootstrap manifest fetch failed${response?.status ? `: ${response.status}` : ''}`);
    const envelope = await boundedJson(response, maxBytes);
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new Error('bootstrap manifest envelope must be an object');
    const fields = Object.keys(envelope).sort();
    if (fields.length !== 3 || fields[0] !== 'keyId' || fields[1] !== 'manifest' || fields[2] !== 'signature') throw new Error('bootstrap manifest envelope contains undeclared fields');

    const allowedKeys = trustedKeyIds(trustedRotation, now);
    if (!allowedKeys.includes(envelope.keyId)) throw new Error('bootstrap manifest signing key is not authorized by trusted rotation state');
    const publicKey = publicKeyFor(publicKeys, envelope.keyId);
    if (!publicKey || !verifyBootstrapManifest(envelope.manifest, envelope.signature, publicKey)) throw new Error('bootstrap manifest signature verification failed');
    const freshness = enforceBootstrapFreshness(envelope.manifest, { minimumVersion, now });
    if (freshness.manifest.network !== selected.name) throw new Error('bootstrap manifest network does not match selected profile');

    return Object.freeze({ profile: selected.name, manifest: freshness.manifest, peers: freshness.manifest.peers });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }
}
