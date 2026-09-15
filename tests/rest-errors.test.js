import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpAdapterServer } from '../adapters/http/server.js';

function nodeFixture(overrides = {}) {
  return {
    identity: { nodeId: 'truyn:node:rest-error-fixture', algorithm: 'Ed25519' },
    sessionToken: 'fixture-session',
    async register() {},
    async capabilities() { return []; },
    async find() { return []; },
    async offer() { return { ok: true }; },
    async need() { return { ok: true }; },
    async requestStatus() { return { ok: true }; },
    async poll() { return []; },
    async result() { return { ok: true }; },
    ...overrides
  };
}

async function withServer(node, fn, options = {}) {
  const adapter = createHttpAdapterServer({ node, ...options });
  const baseUrl = await adapter.listen({ port: 0 });
  try { await fn(baseUrl); } finally { await adapter.close(); }
}

function assertNormalized(body, code, message, correlationId) {
  assert.deepEqual(body, {
    ok: false,
    error: { code, message },
    correlationId
  });
}

test('S44 normalizes v1 validation errors and preserves a safe caller correlation id', async () => {
  await withServer(nodeFixture(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/need`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-correlation-id': 's44-validation' },
      body: '{}'
    });
    assert.equal(response.status, 400);
    assertNormalized(await response.json(), 'invalid_request', 'capability is required', 's44-validation');
  });
});

test('S44 rejects malformed JSON without reflecting parser details', async () => {
  await withServer(nodeFixture(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/offer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-correlation-id': 's44-json' },
      body: '{broken'
    });
    assert.equal(response.status, 400);
    assertNormalized(await response.json(), 'invalid_request', 'request body is not valid JSON', 's44-json');
  });
});

test('S44 maps authorization failures to a stable public code without leaking internals', async () => {
  const secret = 'relay-session-secret-that-must-not-leak';
  const error = Object.assign(new Error(`forbidden ${secret}`), { status: 403 });
  await withServer(nodeFixture({ async find() { throw error; } }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/discovery`, { headers: { 'x-correlation-id': 's44-auth' } });
    assert.equal(response.status, 403);
    const text = await response.text();
    assert.equal(text.includes(secret), false);
    assertNormalized(JSON.parse(text), 'authorization_denied', 'request is not authorized', 's44-auth');
  });
});

test('S44 maps unknown internal failures to bounded internal_error and generates correlation id', async () => {
  const secret = 'provider-topology-secret-that-must-not-leak';
  await withServer(nodeFixture({ async requestStatus() { throw new Error(secret); } }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/needs/request-1`);
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(JSON.stringify(body).includes(secret), false);
    assert.equal(body.ok, false);
    assert.deepEqual(body.error, { code: 'internal_error', message: 'TRUYN could not complete the request' });
    assert.match(body.correlationId, /^[0-9a-f-]{36}$/i);
  });
});

test('S44 normalizes unknown v1 routes while preserving legacy non-v1 compatibility shape', async () => {
  await withServer(nodeFixture(), async (baseUrl) => {
    const v1 = await fetch(`${baseUrl}/v1/missing`, { headers: { 'x-correlation-id': 's44-404' } });
    assert.equal(v1.status, 404);
    assertNormalized(await v1.json(), 'not_found', 'requested resource was not found', 's44-404');

    const legacy = await fetch(`${baseUrl}/missing`);
    assert.equal(legacy.status, 404);
    assert.deepEqual(await legacy.json(), { ok: false, error: 'not_found' });
  });
});
