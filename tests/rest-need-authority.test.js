import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpAdapterServer } from '../adapters/http/server.js';

function assertNormalizedError(body, code, message) {
  assert.equal(body.ok, false);
  assert.deepEqual(body.error, { code, message });
  assert.match(body.correlationId, /^[0-9a-f-]{36}$/i);
}

test('REST NEED delegates only capability, input and policy to canonical node authority', async (t) => {
  const calls = [];
  const node = {
    identity: { nodeId: 'truyn:node:rest-need-fixture', algorithm: 'Ed25519' },
    sessionToken: null,
    async register(metadata) {
      calls.push(['register', metadata]);
      this.sessionToken = 'opaque-session';
    },
    async need(capability, input, policy) {
      calls.push(['need', capability, input, policy]);
      return { requestId: 'need-1', status: 'accepted' };
    }
  };
  const bridge = createHttpAdapterServer({ node });
  const baseUrl = await bridge.listen({ port: 0 });
  t.after(() => bridge.close());

  const response = await fetch(`${baseUrl}/v1/need`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      capability: 'public.search',
      input: { query: 'TRUYN' },
      policy: { maxCost: 1 },
      from: 'truyn:node:spoofed-requester',
      owner: 'attacker',
      tenant: 'private-tenant',
      billingAccount: 'victim-account',
      provider: 'truyn:node:forced-provider'
    })
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { requestId: 'need-1', status: 'accepted' });
  assert.deepEqual(calls, [
    ['register', { name: 'truyn-http-adapter' }],
    ['need', 'public.search', { query: 'TRUYN' }, { maxCost: 1 }]
  ]);
});

test('REST NEED fails closed before canonical node execution when registration is denied', async (t) => {
  let needCalls = 0;
  const node = {
    identity: { nodeId: 'truyn:node:rest-need-denied', algorithm: 'Ed25519' },
    sessionToken: null,
    async register() {
      const error = new Error('forbidden');
      error.status = 403;
      throw error;
    },
    async need() {
      needCalls += 1;
      return { requestId: 'must-not-exist' };
    }
  };
  const bridge = createHttpAdapterServer({ node });
  const baseUrl = await bridge.listen({ port: 0 });
  t.after(() => bridge.close());

  const response = await fetch(`${baseUrl}/v1/need`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ capability: 'private.internal', input: { secret: true } })
  });

  assert.equal(response.status, 403);
  assertNormalizedError(await response.json(), 'authorization_denied', 'request is not authorized');
  assert.equal(needCalls, 0, 'denied registration must prevent NEED execution');
});

test('REST NEED rejects missing capability before canonical node execution', async (t) => {
  let needCalls = 0;
  const node = {
    identity: { nodeId: 'truyn:node:rest-need-invalid', algorithm: 'Ed25519' },
    sessionToken: 'opaque-session',
    async register() {},
    async need() {
      needCalls += 1;
    }
  };
  const bridge = createHttpAdapterServer({ node });
  const baseUrl = await bridge.listen({ port: 0 });
  t.after(() => bridge.close());

  const response = await fetch(`${baseUrl}/v1/need`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: { query: 'missing capability' } })
  });

  assert.equal(response.status, 400);
  assertNormalizedError(await response.json(), 'invalid_request', 'capability is required');
  assert.equal(needCalls, 0);
});
