import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttpAdapterServer } from '../adapters/http/server.js';

function fixture(overrides = {}) {
  return {
    identity: { nodeId: 'truyn:node:s48-security', algorithm: 'Ed25519' },
    sessionToken: 'relay-session-secret-never-expose',
    async register() {},
    async capabilities() { return []; },
    async find() { return []; },
    async offer() { return { ok: true }; },
    async need() { return { ok: true, needId: 'signed-canonical-need' }; },
    async requestStatus() { return { ok: true, status: 'matched' }; },
    async revoke() { return { ok: true, cancelledAt: new Date().toISOString() }; },
    async poll() { return { events: [] }; },
    async result() { return { ok: true }; },
    ...overrides
  };
}

async function withServer(node, fn, options = {}) {
  const adapter = createHttpAdapterServer({ node, ...options });
  const baseUrl = await adapter.listen({ port: 0 });
  try { await fn(baseUrl); } finally { await adapter.close(); }
}

test('S48 refuses non-loopback exposure before binding a socket', async () => {
  const adapter = createHttpAdapterServer({ node: fixture() });
  await assert.rejects(adapter.listen({ host: '0.0.0.0', port: 0 }), /local-only/);
  assert.equal(adapter.server.listening, false);
});

test('S48 bounds request bodies and does not execute canonical NEED after overflow', async () => {
  let needCalls = 0;
  await withServer(fixture({ async need() { needCalls += 1; return { ok: true }; } }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/need`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-correlation-id': 's48-body-bound' },
      body: JSON.stringify({ capability: 'x', input: '0123456789abcdef' })
    });
    assert.equal(response.status, 413);
    const body = await response.json();
    assert.equal(body.error.code, 'payload_too_large');
    assert.equal(body.correlationId, 's48-body-bound');
    assert.equal(needCalls, 0);
  }, { maxBodyBytes: 8 });
});

test('S48 rejects unsafe correlation metadata and never reflects it', async () => {
  await withServer(fixture({ async find() { throw Object.assign(new Error('secret-internal-detail'), { status: 403 }); } }), async (baseUrl) => {
    const unsafe = '<script>alert(1)</script>';
    const response = await fetch(`${baseUrl}/v1/discovery`, { headers: { 'x-correlation-id': unsafe } });
    assert.equal(response.status, 403);
    const text = await response.text();
    assert.equal(text.includes(unsafe), false);
    assert.equal(text.includes('secret-internal-detail'), false);
    const body = JSON.parse(text);
    assert.match(body.correlationId, /^[0-9a-f-]{36}$/i);
    assert.equal(body.error.code, 'authorization_denied');
  });
});

test('S48 request fields cannot assert identity, provider authority, session, tenant or billing state', async () => {
  let observed;
  await withServer(fixture({
    async need(capability, input, policy) {
      observed = { capability, input, policy };
      return { ok: true, needId: 'signed-canonical-need' };
    }
  }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/need`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        capability: 'safe.capability',
        input: { value: 1 },
        policy: { maxCost: 1 },
        requester: 'attacker',
        requesterId: 'attacker',
        provider: 'attacker-provider',
        providerOwner: 'attacker-owner',
        sessionToken: 'attacker-session',
        tenant: 'attacker-tenant',
        billingIdentity: 'attacker-billing'
      })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(observed, {
      capability: 'safe.capability',
      input: { value: 1 },
      policy: { maxCost: 1 }
    });
    assert.equal(JSON.stringify(await response.json()).includes('attacker'), false);
  });
});

test('S48 v1 responses carry anti-sniffing and no-store headers and do not expose relay secrets', async () => {
  const secret = 'relay-session-secret-never-expose';
  await withServer(fixture({ sessionToken: secret }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/version`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await response.text()).includes(secret), false);
  });
});
