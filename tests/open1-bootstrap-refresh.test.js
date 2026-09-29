import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOTSTRAP_MANIFEST_SCHEMA } from '../core/network/bootstrap-manifest.js';
import { refreshBootstrapPeers } from '../core/network/bootstrap-refresh.js';

const peer = (id, domain) => ({ id, domain, endpoints: [{ transport: 'https', url: `https://${domain}/bootstrap` }], version: 1 });
const manifest = (peers, overrides = {}) => ({
  schema: BOOTSTRAP_MANIFEST_SCHEMA,
  network: 'mainnet', version: 9,
  issuedAt: '2026-09-29T00:00:00Z', expiresAt: '2026-09-30T00:00:00Z',
  peers,
  rotation: { activeKeyId: 'key-a', nextKeyId: null, notBefore: null },
  ...overrides
});

test('S144 replaces expired/unhealthy peers from current allowed manifest without changing network', () => {
  const oldA = peer('a', 'a.bootstrap.example');
  const oldB = peer('b', 'b.bootstrap.example');
  const nextB = peer('b', 'b.bootstrap.example');
  const nextC = peer('c', 'c.bootstrap.example');
  const result = refreshBootstrapPeers({
    currentPeers: [oldA, oldB],
    manifest: manifest([nextB, nextC]),
    now: '2026-09-29T12:00:00Z',
    minimumVersion: 9,
    healthy: (entry) => entry.id !== 'a'
  });
  assert.equal(result.network, 'mainnet');
  assert.equal(result.manifestVersion, 9);
  assert.deepEqual(result.peers.map(({ id }) => id), ['b', 'c']);
});

test('S144 rejects expired or downgrade refresh manifests', () => {
  const peers = [peer('a', 'a.bootstrap.example'), peer('b', 'b.bootstrap.example')];
  assert.throws(() => refreshBootstrapPeers({ currentPeers: peers, manifest: manifest(peers), now: '2026-09-30T00:00:00Z' }), /expired/);
  assert.throws(() => refreshBootstrapPeers({ currentPeers: peers, manifest: manifest(peers, { version: 8 }), now: '2026-09-29T12:00:00Z', minimumVersion: 9 }), /downgrade/);
});

test('S144 fails closed when refresh cannot retain two healthy allowed peers', () => {
  const peers = [peer('a', 'a.bootstrap.example'), peer('b', 'b.bootstrap.example')];
  assert.throws(() => refreshBootstrapPeers({ currentPeers: peers, manifest: manifest(peers), now: '2026-09-29T12:00:00Z', healthy: (entry) => entry.id === 'a' }), /insufficient healthy/);
});
