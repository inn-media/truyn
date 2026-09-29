import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOTSTRAP_MANIFEST_SCHEMA } from '../core/network/bootstrap-manifest.js';
import { enforceBootstrapFreshness } from '../core/network/bootstrap-freshness.js';

function manifest(overrides = {}) {
  return {
    schema: BOOTSTRAP_MANIFEST_SCHEMA,
    network: 'mainnet',
    version: 7,
    issuedAt: '2026-09-29T00:00:00.000Z',
    expiresAt: '2026-09-30T00:00:00.000Z',
    peers: [{ id: 'peer-1', domain: 'bootstrap.example', endpoints: [{ transport: 'https', url: 'https://bootstrap.example/peer' }], version: 1 }],
    rotation: { activeKeyId: 'key-a', nextKeyId: 'key-b', notBefore: '2026-09-29T12:00:00.000Z' },
    ...overrides
  };
}

test('S140 accepts only active key before rotation and overlap at activation', () => {
  const before = enforceBootstrapFreshness(manifest(), { now: '2026-09-29T06:00:00.000Z', minimumVersion: 7 });
  assert.deepEqual([...before.acceptedKeyIds], ['key-a']);
  const overlap = enforceBootstrapFreshness(manifest(), { now: '2026-09-29T12:00:00.000Z', minimumVersion: 7 });
  assert.deepEqual([...overlap.acceptedKeyIds], ['key-a', 'key-b']);
});

test('S140 rejects expired manifests', () => {
  assert.throws(() => enforceBootstrapFreshness(manifest(), { now: '2026-09-30T00:00:00.000Z' }), /expired/);
});

test('S140 rejects downgrade manifests', () => {
  assert.throws(() => enforceBootstrapFreshness(manifest({ version: 6 }), { now: '2026-09-29T06:00:00.000Z', minimumVersion: 7 }), /downgrade/);
});

test('S140 rejects malformed rotation metadata', () => {
  assert.throws(() => enforceBootstrapFreshness(manifest({ rotation: { activeKeyId: 'key-a', nextKeyId: 'key-b', notBefore: null } }), { now: '2026-09-29T06:00:00.000Z' }), /declared together/);
  assert.throws(() => enforceBootstrapFreshness(manifest({ rotation: { activeKeyId: 'key-a', nextKeyId: 'key-a', notBefore: '2026-09-29T12:00:00.000Z' } }), { now: '2026-09-29T06:00:00.000Z' }), /must differ/);
});

test('S140 rejects timezone-ambiguous manifest timestamps', () => {
  assert.throws(() => enforceBootstrapFreshness(manifest({ issuedAt: '2026-09-29T00:00:00' }), { now: '2026-09-29T06:00:00.000Z' }), /explicit timezone/);
  assert.throws(() => enforceBootstrapFreshness(manifest({ rotation: { activeKeyId: 'key-a', nextKeyId: 'key-b', notBefore: '2026-09-29T12:00:00' } }), { now: '2026-09-29T06:00:00.000Z' }), /explicit timezone/);
});
