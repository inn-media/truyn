import { selectNetworkProfile } from './profiles.js';
import { verifyBootstrapManifest } from './bootstrap-signing.js';
import { enforceBootstrapFreshness } from './bootstrap-freshness.js';

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

export async function fetchVerifiedBootstrapManifest({ profile, url, publicKeys, minimumVersion, now, fetchImpl = globalThis.fetch } = {}) {
  const selected = selectNetworkProfile(profile);
  if (!selected.bootstrapRequired) return Object.freeze({ profile: selected.name, peers: Object.freeze([]), manifest: null });
  if (typeof fetchImpl !== 'function') throw new Error('bootstrap HTTPS fetch implementation is required');
  const target = httpsUrl(url);
  const response = await fetchImpl(target, { method: 'GET', headers: { accept: 'application/json' }, redirect: 'error' });
  if (!response || response.ok !== true) throw new Error(`bootstrap manifest fetch failed${response?.status ? `: ${response.status}` : ''}`);
  const envelope = await response.json();
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new Error('bootstrap manifest envelope must be an object');
  const fields = Object.keys(envelope).sort();
  if (fields.length !== 3 || fields[0] !== 'keyId' || fields[1] !== 'manifest' || fields[2] !== 'signature') throw new Error('bootstrap manifest envelope contains undeclared fields');

  const freshness = enforceBootstrapFreshness(envelope.manifest, { minimumVersion, now });
  if (freshness.manifest.network !== selected.name) throw new Error('bootstrap manifest network does not match selected profile');
  if (!freshness.acceptedKeyIds.includes(envelope.keyId)) throw new Error('bootstrap manifest signing key is not active');
  const publicKey = publicKeyFor(publicKeys, envelope.keyId);
  if (!publicKey || !verifyBootstrapManifest(freshness.manifest, envelope.signature, publicKey)) throw new Error('bootstrap manifest signature verification failed');

  return Object.freeze({ profile: selected.name, manifest: freshness.manifest, peers: freshness.manifest.peers });
}
