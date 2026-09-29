import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { BOOTSTRAP_MANIFEST_SCHEMA } from '../core/network/bootstrap-manifest.js';
import { canonicalBootstrapManifestBytes, signBootstrapManifest, verifyBootstrapManifest } from '../core/network/bootstrap-signing.js';

function manifest() {
  return {
    schema: BOOTSTRAP_MANIFEST_SCHEMA,
    network: 'mainnet',
    version: 7,
    issuedAt: '2026-09-28T00:00:00Z',
    expiresAt: '2026-10-05T00:00:00Z',
    peers: [{
      id: 'peer:ed25519:alpha',
      domain: 'bootstrap-a.truyn.example',
      version: 3,
      endpoints: [{ transport: 'quic', url: 'quic://bootstrap-a.truyn.example:443' }]
    }],
    rotation: { activeKeyId: 'bootstrap-key-7', nextKeyId: 'bootstrap-key-8', notBefore: '2026-10-01T00:00:00Z' }
  };
}

test('S139 canonical bytes are independent of object key insertion order', () => {
  const a = manifest();
  const b = { rotation: a.rotation, peers: a.peers, expiresAt: a.expiresAt, issuedAt: a.issuedAt, version: a.version, network: a.network, schema: a.schema };
  assert.deepEqual(canonicalBootstrapManifestBytes(a), canonicalBootstrapManifestBytes(b));
});

test('S139 valid Ed25519 bootstrap signature verifies', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const value = manifest();
  const signature = signBootstrapManifest(value, privateKey);
  assert.equal(verifyBootstrapManifest(value, signature, publicKey), true);
});

test('S139 modified manifest bytes fail verification before peer use', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const value = manifest();
  const signature = signBootstrapManifest(value, privateKey);
  const modified = structuredClone(value);
  modified.peers[0].endpoints[0].url = 'quic://bootstrap-b.truyn.example:443';
  assert.equal(verifyBootstrapManifest(modified, signature, publicKey), false);
});

test('S139 malformed signature and undeclared manifest data fail closed', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const value = manifest();
  const signature = signBootstrapManifest(value, privateKey);
  assert.equal(verifyBootstrapManifest(value, 'not-a-valid-signature', publicKey), false);
  const polluted = { ...value, privateKey: 'forbidden' };
  assert.equal(verifyBootstrapManifest(polluted, signature, publicKey), false);
});
