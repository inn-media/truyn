import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAuthenticatedFallback } from '../core/network/authenticated-fallback.js';

const peer = { id: 'peer-a', endpoints: [
  { transport: 'websocket', url: 'wss://peer.example/ws' },
  { transport: 'https', url: 'https://peer.example/connect' }
] };
const connection = { authenticated: true, authorized: true, peerId: 'peer-a' };
const ok = { reachable: true, connection };
const options = { peer, identity: 'peer-a', authorization: 'need:execute' };

test('S148 uses authenticated WebSocket fallback first and preserves auth context', async () => {
  let seen;
  const result = await selectAuthenticatedFallback({ ...options, connectWebSocket: async (input) => { seen = input; return ok; }, connectHttps: async () => { throw new Error('should not run'); } });
  assert.equal(result.transport, 'websocket');
  assert.equal(result.peerId, 'peer-a');
  assert.equal(result.connection, connection);
  assert.equal(seen.identity, 'peer-a');
  assert.equal(seen.authorization, 'need:execute');
  assert.equal(seen.signal instanceof AbortSignal, true);
  assert.equal(seen.signal.aborted, false);
});

test('S148 falls through to authenticated HTTPS on explicit or thrown reachability failure', async () => {
  let result = await selectAuthenticatedFallback({ ...options, connectWebSocket: async () => ({ reachable: false }), connectHttps: async () => ok });
  assert.equal(result.transport, 'https');
  const refused = new Error('refused'); refused.code = 'ECONNREFUSED';
  result = await selectAuthenticatedFallback({ ...options, connectWebSocket: async () => { throw refused; }, connectHttps: async () => ok });
  assert.equal(result.transport, 'https');
});

test('S148 preserves HTTPS eligibility when multiple WSS endpoints exist', async () => {
  const many = { id: 'peer-a', endpoints: [
    { transport: 'wss', url: 'wss://one.example/ws' },
    { transport: 'websocket', url: 'wss://two.example/ws' },
    { transport: 'https', url: 'https://peer.example/connect' }
  ] };
  const result = await selectAuthenticatedFallback({ ...options, peer: many, connectWebSocket: async () => ({ reachable: false }), connectHttps: async () => ok });
  assert.equal(result.transport, 'https');
});

test('S148 rejects insecure schemes and accepts normalized secure URL schemes', async () => {
  const insecure = { id: 'peer-a', endpoints: [{ transport: 'websocket', url: 'ws://peer.example/ws' }, { transport: 'https', url: 'http://peer.example/connect' }] };
  await assert.rejects(() => selectAuthenticatedFallback({ ...options, peer: insecure, connectWebSocket: async () => ok, connectHttps: async () => ok }), /no authenticated fallback endpoint/);
  const upper = { id: 'peer-a', endpoints: [{ transport: 'wss', url: 'WSS://peer.example/ws' }] };
  const result = await selectAuthenticatedFallback({ ...options, peer: upper, connectWebSocket: async () => ok });
  assert.equal(result.transport, 'websocket');
});

test('S148 validates the exact returned connection and fails closed on conflicting session data', async () => {
  await assert.rejects(() => selectAuthenticatedFallback({ ...options, connectWebSocket: async () => ({ reachable: true, connection: {}, session: connection }) }), /authentication failed/);
  await assert.rejects(() => selectAuthenticatedFallback({ ...options, connectWebSocket: async () => ({ reachable: true, connection: { ...connection, authorized: false } }) }), /authorization failed/);
  await assert.rejects(() => selectAuthenticatedFallback({ ...options, connectWebSocket: async () => ({ reachable: true, connection: { authenticated: true, authorized: true } }) }), /identity attestation missing/);
  await assert.rejects(() => selectAuthenticatedFallback({ ...options, connectWebSocket: async () => ({ reachable: true, connection: { ...connection, peerId: 'peer-b' } }) }), /identity changed/);
});

test('S148 propagates security/control connector failures instead of falling back', async () => {
  let httpsCalled = false;
  const denied = new Error('authorization denied'); denied.code = 'EAUTH';
  await assert.rejects(() => selectAuthenticatedFallback({ ...options, connectWebSocket: async () => { throw denied; }, connectHttps: async () => { httpsCalled = true; return ok; } }), /authorization denied/);
  assert.equal(httpsCalled, false);
});

test('S148 aborts a timed-out connector before continuing to HTTPS', async () => {
  let timedOutSignal;
  const result = await selectAuthenticatedFallback({ ...options, attemptTimeoutMs: 5, connectWebSocket: async ({ signal }) => {
    timedOutSignal = signal;
    return await new Promise((resolve, reject) => signal.addEventListener('abort', () => {
      const error = new Error('aborted'); error.name = 'AbortError'; reject(error);
    }, { once: true }));
  }, connectHttps: async () => ok });
  assert.equal(result.transport, 'https');
  assert.equal(timedOutSignal.aborted, true);
});

test('S148 bounds fallback attempts', async () => {
  let attempts = 0;
  await assert.rejects(() => selectAuthenticatedFallback({ ...options, maxAttempts: 1, connectWebSocket: async () => { attempts += 1; return { reachable: false }; }, connectHttps: async () => { attempts += 1; return ok; } }), /no reachable/);
  assert.equal(attempts, 1);
});
