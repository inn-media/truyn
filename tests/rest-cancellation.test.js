import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createHttpAdapterServer } from '../adapters/http/server.js';

async function fixture(t) {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  const requester = new TruynNode({ relayUrl });
  const provider = new TruynNode({ relayUrl });
  await requester.register({ name: 'requester' });
  await provider.register({ name: 'provider' });
  await provider.offer('rest.cancel', {});
  const adapter = createHttpAdapterServer({ node: requester });
  const baseUrl = await adapter.listen({ port: 0 });
  t.after(async () => { await adapter.close(); await relay.close(); });
  return { requester, provider, baseUrl };
}

test('DELETE /v1/needs/:id maps requester cancellation to canonical REVOKE exactly once', async (t) => {
  const { requester, provider, baseUrl } = await fixture(t);
  const matched = await requester.need('rest.cancel', { value: 1 });
  const response = await fetch(`${baseUrl}/v1/needs/${encodeURIComponent(matched.needId)}`, { method: 'DELETE' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.requestId, matched.needId);
  assert.equal(body.cancelled, true);

  const status = await requester.requestStatus(matched.needId);
  assert.equal(status.status, 'cancelled');
  assert.ok(status.cancelledAt);

  const providerEvents = await provider.poll();
  const revokes = providerEvents.events.filter((event) => event.kind === 'REVOKE' && event.targetId === matched.needId);
  assert.equal(revokes.length, 1);

  const repeated = await fetch(`${baseUrl}/v1/needs/${encodeURIComponent(matched.needId)}`, { method: 'DELETE' });
  assert.equal(repeated.status, 200);
  const repeatedBody = await repeated.json();
  assert.equal(repeatedBody.idempotent, true);
  const afterRepeat = await provider.poll();
  assert.equal(afterRepeat.events.filter((event) => event.kind === 'REVOKE' && event.targetId === matched.needId).length, 0);
});

test('REST cancellation fails closed for a request not owned by the adapter node', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  const owner = new TruynNode({ relayUrl });
  const foreign = new TruynNode({ relayUrl });
  const provider = new TruynNode({ relayUrl });
  await owner.register({ name: 'owner' });
  await foreign.register({ name: 'foreign' });
  await provider.register({ name: 'provider' });
  await provider.offer('rest.cancel.foreign', {});
  const matched = await owner.need('rest.cancel.foreign', {});
  const adapter = createHttpAdapterServer({ node: foreign });
  const baseUrl = await adapter.listen({ port: 0 });
  t.after(async () => { await adapter.close(); await relay.close(); });

  const response = await fetch(`${baseUrl}/v1/needs/${encodeURIComponent(matched.needId)}`, { method: 'DELETE' });
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error.code, 'not_found');
  assert.equal((await owner.requestStatus(matched.needId)).status, 'matched');
});

test('REST cancellation cannot cancel an already completed request', async (t) => {
  const { requester, provider, baseUrl } = await fixture(t);
  const matched = await requester.need('rest.cancel', { value: 2 });
  await provider.result(matched.needId, { done: true });
  assert.equal((await requester.requestStatus(matched.needId)).status, 'completed');

  const response = await fetch(`${baseUrl}/v1/needs/${encodeURIComponent(matched.needId)}`, { method: 'DELETE' });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error.code, 'conflict');
  assert.equal((await requester.requestStatus(matched.needId)).status, 'completed');
});
