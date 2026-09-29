import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOTSTRAP_MANIFEST_SCHEMA } from '../core/network/bootstrap-manifest.js';
import { independentBootstrapPeers } from '../core/network/bootstrap-peers.js';

function manifest(peers) {
  return {
    schema: BOOTSTRAP_MANIFEST_SCHEMA,
    network: 'mainnet', version: 8,
    issuedAt: '2026-09-29T00:00:00Z', expiresAt: '2026-09-30T00:00:00Z',
    peers,
    rotation: { activeKeyId: 'key-a', nextKeyId: null, notBefore: null }
  };
}

function peer(id, domain) {
  return { id, domain, endpoints: [{ transport: 'https', url: `https://${domain}/bootstrap` }], version: 1 };
}

test('S143 returns several independently addressable bootstrap peers', () => {
  const peers = independentBootstrapPeers(manifest([
    peer('bootstrap-a', 'a.bootstrap.example'),
    peer('bootstrap-b', 'b.bootstrap.example'),
    peer('bootstrap-c', 'c.bootstrap.example')
  ]));
  assert.deepEqual(peers.map(({ id }) => id), ['bootstrap-a', 'bootstrap-b', 'bootstrap-c']);
});

test('S143 fails closed on a single bootstrap dependency', () => {
  assert.throws(() => independentBootstrapPeers(manifest([peer('bootstrap-a', 'a.bootstrap.example')])), /at least 2/);
});

test('S143 rejects duplicate identity or addressable domain', () => {
  assert.throws(() => independentBootstrapPeers(manifest([
    peer('bootstrap-a', 'a.bootstrap.example'), peer('bootstrap-a', 'b.bootstrap.example')
  ])), /duplicate bootstrap peer identity/);
  assert.throws(() => independentBootstrapPeers(manifest([
    peer('bootstrap-a', 'A.BOOTSTRAP.EXAMPLE.'), peer('bootstrap-b', 'a.bootstrap.example')
  ])), /duplicate bootstrap peer domain/);
});
