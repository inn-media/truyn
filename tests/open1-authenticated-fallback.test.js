import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAuthenticatedFallback } from '../core/network/authenticated-fallback.js';

const peer = { id: 'peer-a', endpoints: [
  { transport: 'websocket', url: 'wss://peer.example/ws' },
  { transport: 'https', url: 'https://peer.example/connect' }
] };
const ok = { reachable: true, authenticated: true, authorized: true, peerId: 'peer-a', connection: {} };
const options = { peer, identity: 'peer-a', authorization: 'need:execute' };

test('S148 uses authenticated WebSocket fallback first and preserves auth context', async () => {
  let seen;
  const result = await selectAuthenticatedFallback({ ...options, connectWebSocket: async (input) => { seen = input; return ok; }, connectHttps: async () => { throw new Error('should not run'); } });
  assert.equal(result.transport, 'websocket');
  assert.equal(result.peerId, 'peer-a');
  assert.equal(seen.identity, 'peer-a');
  assert.equal(seen.authorization, 'need:execute');
});

test('S148 falls through to authenticated HTTPS when WebSocket is unreachable', async () => {
  const result = await selectAuthenticatedFallback({ ...options, connectWebSocket: async () => ({ reachable: false }), connectHttps: async () => ok });
  assert.equal(result.transport, 'https');
  assert.equal(result.authenticated, true);
  assert.equal(result.authorized, true);
});

test('S148 fails closed on authentication, authorization, or identity change', async () => {
  await assert.rejects(() => selectAuthenticatedFallback({ ...options, connectWebSocket: async () => ({ ...ok, authenticated: false }) }), /authentication failed/);
  await assert.rejects(() => selectAuthenticatedFallback({ ...options, connectWebSocket: async () => ({ ...ok, authorized: false }) }), /authorization failed/);
  await assert.rejects(() => selectAuthenticatedFallback({ ...options, connectWebSocket: async () => ({ ...ok, peerId: 'peer-b' }) }), /identity changed/);
});

test('S148 bounds fallback attempts', async () => {
  let attempts = 0;
  await assert.rejects(() => selectAuthenticatedFallback({ ...options, maxAttempts: 1, connectWebSocket: async () => { attempts += 1; return { reachable: false }; }, connectHttps: async () => { attempts += 1; return ok; } }), /no reachable/);
  assert.equal(attempts, 1);
});
