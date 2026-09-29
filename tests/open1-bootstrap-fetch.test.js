import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { BOOTSTRAP_MANIFEST_SCHEMA } from '../core/network/bootstrap-manifest.js';
import { signBootstrapManifest } from '../core/network/bootstrap-signing.js';
import { fetchVerifiedBootstrapManifest } from '../core/network/bootstrap-fetch.js';

function manifest(overrides = {}) {
  return { schema: BOOTSTRAP_MANIFEST_SCHEMA, network: 'mainnet', version: 7, issuedAt: '2026-09-29T00:00:00.000Z', expiresAt: '2026-09-30T00:00:00.000Z', peers: [{ id: 'peer-1', domain: 'bootstrap.example', endpoints: [{ transport: 'https', url: 'https://bootstrap.example/peer' }], version: 1 }], rotation: { activeKeyId: 'key-a', nextKeyId: null, notBefore: null }, ...overrides };
}

function response(body) {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  let sent = false;
  return { ok: true, status: 200, headers: { get(name) { return name === 'content-length' ? String(bytes.byteLength) : null; } }, body: { getReader() { return { async read() { if (sent) return { done: true }; sent = true; return { done: false, value: bytes }; }, releaseLock() {} }; } } };
}

async function envelope(value = manifest(), keyId = 'key-a') {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publicKey, body: { keyId, manifest: value, signature: signBootstrapManifest(value, privateKey) } };
}

const trusted = { activeKeyId: 'key-a', nextKeyId: 'key-b', notBefore: '2026-09-29T12:00:00.000Z' };
const base = { profile: 'mainnet', url: 'https://bootstrap.example/manifest', minimumVersion: 7, now: '2026-09-29T06:00:00.000Z', trustedRotation: trusted };

test('S141 exposes fetched peers only after HTTPS signature/version/freshness verification', async () => {
  const { publicKey, body } = await envelope();
  const result = await fetchVerifiedBootstrapManifest({ ...base, publicKeys: { 'key-a': publicKey }, fetchImpl: async () => response(body) });
  assert.equal(result.peers.length, 1);
  assert.equal(result.peers[0].id, 'peer-1');
});

test('S141 fails closed before peer trust on bad signature, downgrade, expiry, network mismatch or non-HTTPS fetch', async () => {
  const signed = await envelope();
  await assert.rejects(fetchVerifiedBootstrapManifest({ ...base, publicKeys: { 'key-a': generateKeyPairSync('ed25519').publicKey }, fetchImpl: async () => response(signed.body) }), /signature verification failed/);
  const downgrade = await envelope(manifest({ version: 6 }));
  await assert.rejects(fetchVerifiedBootstrapManifest({ ...base, publicKeys: { 'key-a': downgrade.publicKey }, fetchImpl: async () => response(downgrade.body) }), /downgrade/);
  const expired = await envelope();
  await assert.rejects(fetchVerifiedBootstrapManifest({ ...base, now: '2026-09-30T00:00:00.000Z', publicKeys: { 'key-a': expired.publicKey }, fetchImpl: async () => response(expired.body) }), /expired/);
  const wrongNetwork = await envelope(manifest({ network: 'testnet' }));
  await assert.rejects(fetchVerifiedBootstrapManifest({ ...base, publicKeys: { 'key-a': wrongNetwork.publicKey }, fetchImpl: async () => response(wrongNetwork.body) }), /does not match/);
  await assert.rejects(fetchVerifiedBootstrapManifest({ ...base, url: 'http://bootstrap.example/manifest', publicKeys: {} }), /must use HTTPS/);
});

test('S141 rejects staged or stale keys not authorized by prior trusted rotation state', async () => {
  const staged = await envelope(manifest({ rotation: { activeKeyId: 'key-b', nextKeyId: null, notBefore: null } }), 'key-b');
  await assert.rejects(fetchVerifiedBootstrapManifest({ ...base, publicKeys: { 'key-b': staged.publicKey }, fetchImpl: async () => response(staged.body) }), /not authorized/);
});

test('S141 requires a trusted version floor and bounds response bytes', async () => {
  const signed = await envelope();
  await assert.rejects(fetchVerifiedBootstrapManifest({ ...base, minimumVersion: undefined, publicKeys: { 'key-a': signed.publicKey }, fetchImpl: async () => response(signed.body) }), /minimumVersion is required/);
  await assert.rejects(fetchVerifiedBootstrapManifest({ ...base, maxBytes: 8, publicKeys: { 'key-a': signed.publicKey }, fetchImpl: async () => response(signed.body) }), /byte limit/);
});

test('S141 applies a request deadline and caller cancellation signal', async () => {
  await assert.rejects(fetchVerifiedBootstrapManifest({ ...base, timeoutMs: 5, publicKeys: {}, fetchImpl: async (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) }), /timed out/);
});
