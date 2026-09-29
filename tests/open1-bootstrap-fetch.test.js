import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { BOOTSTRAP_MANIFEST_SCHEMA } from '../core/network/bootstrap-manifest.js';
import { signBootstrapManifest } from '../core/network/bootstrap-signing.js';
import { fetchVerifiedBootstrapManifest } from '../core/network/bootstrap-fetch.js';

function manifest(overrides = {}) {
  return { schema: BOOTSTRAP_MANIFEST_SCHEMA, network: 'mainnet', version: 7, issuedAt: '2026-09-29T00:00:00.000Z', expiresAt: '2026-09-30T00:00:00.000Z', peers: [{ id: 'peer-1', domain: 'bootstrap.example', endpoints: [{ transport: 'https', url: 'https://bootstrap.example/peer' }], version: 1 }], rotation: { activeKeyId: 'key-a', nextKeyId: null, notBefore: null }, ...overrides };
}

function response(body) { return { ok: true, status: 200, async json() { return body; } }; }

async function envelope(value = manifest()) {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { publicKey, body: { keyId: 'key-a', manifest: value, signature: signBootstrapManifest(value, privateKey) } };
}

test('S141 exposes fetched peers only after HTTPS signature/version/freshness verification', async () => {
  const { publicKey, body } = await envelope();
  const result = await fetchVerifiedBootstrapManifest({ profile: 'mainnet', url: 'https://bootstrap.example/manifest', publicKeys: { 'key-a': publicKey }, minimumVersion: 7, now: '2026-09-29T06:00:00.000Z', fetchImpl: async () => response(body) });
  assert.equal(result.peers.length, 1);
  assert.equal(result.peers[0].id, 'peer-1');
});

test('S141 fails closed before peer trust on bad signature, downgrade, expiry, network mismatch or non-HTTPS fetch', async () => {
  const signed = await envelope();
  await assert.rejects(fetchVerifiedBootstrapManifest({ profile: 'mainnet', url: 'https://bootstrap.example/manifest', publicKeys: { 'key-a': generateKeyPairSync('ed25519').publicKey }, minimumVersion: 7, now: '2026-09-29T06:00:00.000Z', fetchImpl: async () => response(signed.body) }), /signature verification failed/);
  const downgrade = await envelope(manifest({ version: 6 }));
  await assert.rejects(fetchVerifiedBootstrapManifest({ profile: 'mainnet', url: 'https://bootstrap.example/manifest', publicKeys: { 'key-a': downgrade.publicKey }, minimumVersion: 7, now: '2026-09-29T06:00:00.000Z', fetchImpl: async () => response(downgrade.body) }), /downgrade/);
  const expired = await envelope();
  await assert.rejects(fetchVerifiedBootstrapManifest({ profile: 'mainnet', url: 'https://bootstrap.example/manifest', publicKeys: { 'key-a': expired.publicKey }, minimumVersion: 7, now: '2026-09-30T00:00:00.000Z', fetchImpl: async () => response(expired.body) }), /expired/);
  const wrongNetwork = await envelope(manifest({ network: 'testnet' }));
  await assert.rejects(fetchVerifiedBootstrapManifest({ profile: 'mainnet', url: 'https://bootstrap.example/manifest', publicKeys: { 'key-a': wrongNetwork.publicKey }, minimumVersion: 7, now: '2026-09-29T06:00:00.000Z', fetchImpl: async () => response(wrongNetwork.body) }), /does not match/);
  await assert.rejects(fetchVerifiedBootstrapManifest({ profile: 'mainnet', url: 'http://bootstrap.example/manifest', publicKeys: {}, fetchImpl: async () => response({}) }), /must use HTTPS/);
});
