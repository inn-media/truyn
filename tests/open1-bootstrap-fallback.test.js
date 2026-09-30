import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOTSTRAP_MANIFEST_SCHEMA } from '../core/network/bootstrap-manifest.js';
import { connectBootstrapFallback, orderedBootstrapFallbacks } from '../core/network/bootstrap-fallback.js';

const peer = (id, domain) => ({ id, domain, endpoints: [{ transport: 'https', url: `https://${domain}/bootstrap` }], version: 1 });
const manifest = (peers) => ({
  schema: BOOTSTRAP_MANIFEST_SCHEMA,
  network: 'mainnet', version: 10,
  issuedAt: '2026-09-30T00:00:00Z', expiresAt: '2026-10-01T00:00:00Z',
  peers,
  rotation: { activeKeyId: 'key-a', nextKeyId: null, notBefore: null }
});

test('S145 fallback ordering is deterministic regardless of manifest peer order', () => {
  const a = peer('a', 'a.bootstrap.example');
  const b = peer('b', 'b.bootstrap.example');
  const c = peer('c', 'c.bootstrap.example');
  assert.deepEqual(orderedBootstrapFallbacks(manifest([c, a, b])).map(({ id }) => id), ['a', 'b', 'c']);
  assert.deepEqual(orderedBootstrapFallbacks(manifest([b, c, a])).map(({ id }) => id), ['a', 'b', 'c']);
});

test('S145 failure of first verified bootstrap falls through to later healthy entry', async () => {
  const attempts = [];
  const result = await connectBootstrapFallback({
    manifest: manifest([peer('b', 'b.bootstrap.example'), peer('a', 'a.bootstrap.example'), peer('c', 'c.bootstrap.example')]),
    connect: async (entry) => {
      attempts.push(entry.id);
      if (entry.id === 'a') throw new Error('unreachable');
      if (entry.id === 'b') return { authenticated: true };
      return null;
    }
  });
  assert.deepEqual(attempts, ['a', 'b']);
  assert.equal(result.peer.id, 'b');
  assert.deepEqual(result.connection, { authenticated: true });
});

test('S145 fails closed when every verified bootstrap is unavailable', async () => {
  await assert.rejects(
    connectBootstrapFallback({ manifest: manifest([peer('b', 'b.bootstrap.example'), peer('a', 'a.bootstrap.example')]), connect: async () => null }),
    /all verified bootstrap entries unavailable/
  );
});
