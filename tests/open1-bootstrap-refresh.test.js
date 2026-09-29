import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOTSTRAP_MANIFEST_SCHEMA } from '../core/network/bootstrap-manifest.js';
import { refreshBootstrapPeers } from '../core/network/bootstrap-refresh.js';

const peer = (id, domain, version = 1) => ({ id, domain, endpoints: [{ transport: 'https', url: `https://${domain}/bootstrap?v=${version}` }], version });
const manifest = (peers, overrides = {}) => ({
  schema: BOOTSTRAP_MANIFEST_SCHEMA,
  network: 'mainnet', version: 9,
  issuedAt: '2026-09-29T00:00:00Z', expiresAt: '2026-09-30T00:00:00Z',
  peers,
  rotation: { activeKeyId: 'key-a', nextKeyId: null, notBefore: null },
  ...overrides
});

const refresh = (options) => refreshBootstrapPeers({ currentNetwork: 'mainnet', ...options });

test('S144 replaces expired/unhealthy peers from current allowed manifest without changing network', () => {
  const oldA = peer('a', 'a.bootstrap.example');
  const oldB = peer('b', 'b.bootstrap.example');
  const nextB = peer('b', 'b.bootstrap.example');
  const nextC = peer('c', 'c.bootstrap.example');
  const result = refresh({
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

test('S144 checks health on the replacement manifest peer', () => {
  const oldA = peer('a', 'a.bootstrap.example', 1);
  const oldB = peer('b', 'b.bootstrap.example', 1);
  const rotatedA = peer('a', 'a.bootstrap.example', 2);
  const nextB = peer('b', 'b.bootstrap.example', 1);
  const nextC = peer('c', 'c.bootstrap.example', 1);
  const result = refresh({
    currentPeers: [oldA, oldB], manifest: manifest([rotatedA, nextB, nextC]), now: '2026-09-29T12:00:00Z',
    healthy: (entry) => !(entry.id === 'a' && entry.version === 2)
  });
  assert.deepEqual(result.peers.map(({ id }) => id), ['b', 'c']);
});

test('S144 rejects a refresh manifest for a different network', () => {
  const peers = [peer('a', 'a.bootstrap.example'), peer('b', 'b.bootstrap.example')];
  assert.throws(() => refresh({ currentPeers: peers, manifest: manifest(peers, { network: 'testnet' }), now: '2026-09-29T12:00:00Z' }), /network identity mismatch/);
});

test('S144 rejects expired or downgrade refresh manifests', () => {
  const peers = [peer('a', 'a.bootstrap.example'), peer('b', 'b.bootstrap.example')];
  assert.throws(() => refresh({ currentPeers: peers, manifest: manifest(peers), now: '2026-09-30T00:00:00Z' }), /expired/);
  assert.throws(() => refresh({ currentPeers: peers, manifest: manifest(peers, { version: 8 }), now: '2026-09-29T12:00:00Z', minimumVersion: 9 }), /downgrade/);
});

test('S144 fails closed when refresh cannot retain two healthy allowed peers', () => {
  const peers = [peer('a', 'a.bootstrap.example'), peer('b', 'b.bootstrap.example')];
  assert.throws(() => refresh({ currentPeers: peers, manifest: manifest(peers), now: '2026-09-29T12:00:00Z', healthy: (entry) => entry.id === 'a' }), /insufficient healthy/);
});
