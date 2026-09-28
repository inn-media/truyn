import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOTSTRAP_MANIFEST_SCHEMA, parseBootstrapManifest } from '../core/network/bootstrap-manifest.js';

function validManifest() {
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
      endpoints: [
        { transport: 'quic', url: 'quic://bootstrap-a.truyn.example:443' },
        { transport: 'https', url: 'https://bootstrap-a.truyn.example/bootstrap' }
      ]
    }],
    rotation: { activeKeyId: 'bootstrap-key-7', nextKeyId: 'bootstrap-key-8', notBefore: '2026-10-01T00:00:00Z' }
  };
}

test('S138 accepts bounded public bootstrap metadata', () => {
  const parsed = parseBootstrapManifest(validManifest());
  assert.equal(parsed.network, 'mainnet');
  assert.equal(parsed.peers[0].id, 'peer:ed25519:alpha');
  assert.equal(parsed.rotation.nextKeyId, 'bootstrap-key-8');
});

test('S138 rejects undeclared/private top-level metadata', () => {
  const manifest = validManifest();
  manifest.privateKey = 'must-never-be-public';
  assert.throws(() => parseBootstrapManifest(manifest), /undeclared field/);
});

test('S138 rejects undeclared peer and endpoint fields', () => {
  const peerPrivate = validManifest();
  peerPrivate.peers[0].internalAddress = '10.0.0.7';
  assert.throws(() => parseBootstrapManifest(peerPrivate), /undeclared field/);

  const endpointPrivate = validManifest();
  endpointPrivate.peers[0].endpoints[0].token = 'secret';
  assert.throws(() => parseBootstrapManifest(endpointPrivate), /undeclared field/);
});

test('S138 rejects embedded endpoint credentials and unbounded peer sets', () => {
  const credentials = validManifest();
  credentials.peers[0].endpoints[1].url = 'https://user:secret@bootstrap-a.truyn.example/bootstrap';
  assert.throws(() => parseBootstrapManifest(credentials), /credentials are forbidden/);

  const unbounded = validManifest();
  unbounded.peers = Array.from({ length: 65 }, (_, index) => ({
    id: `peer-${index}`,
    domain: `bootstrap-${index}.truyn.example`,
    version: 1,
    endpoints: [{ transport: 'https', url: `https://bootstrap-${index}.truyn.example/bootstrap` }]
  }));
  assert.throws(() => parseBootstrapManifest(unbounded), /1\.\.64/);
});
