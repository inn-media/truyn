import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createHttpAdapterServer } from '../adapters/http/server.js';

async function withServer(node, run) {
  const bridge = createHttpAdapterServer({ node });
  const url = await bridge.listen({ port: 0 });
  try {
    await run(url);
  } finally {
    await bridge.close();
  }
}

test('REST OFFER registers first and delegates only capability plus metadata to canonical node.offer', async () => {
  const calls = [];
  const node = {
    identity: createIdentity(),
    sessionToken: null,
    async register() {
      calls.push(['register']);
      this.sessionToken = 'session';
      return { ok: true };
    },
    async offer(capability, metadata) {
      calls.push(['offer', capability, metadata]);
      return { offerId: 'offer-rest-authority' };
    }
  };

  await withServer(node, async (url) => {
    const response = await fetch(`${url}/v1/offer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        capability: 'summarize',
        metadata: { model: 'local' },
        from: 'truyn:node:spoofed',
        owner: 'spoofed-owner',
        tenant: 'spoofed-tenant',
        billingAccount: 'spoofed-billing'
      })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { offerId: 'offer-rest-authority' });
  });

  assert.deepEqual(calls, [
    ['register'],
    ['offer', 'summarize', { model: 'local' }]
  ]);
});

test('REST OFFER fails closed before node.offer when canonical registration is denied', async () => {
  let offerCalls = 0;
  const denied = new Error('registration_denied');
  denied.status = 403;
  const node = {
    identity: createIdentity(),
    sessionToken: null,
    async register() { throw denied; },
    async offer() { offerCalls += 1; return { offerId: 'must-not-exist' }; }
  };

  await withServer(node, async (url) => {
    const response = await fetch(`${url}/v1/offer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ capability: 'private-capability', owner: 'spoofed-owner' })
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: 'registration_denied' });
  });

  assert.equal(offerCalls, 0);
});
