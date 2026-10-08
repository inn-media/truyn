import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

test('legacy /v1/events long-polls until NEED arrives', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const requester = new TruynNode({ relayUrl });
  const provider = new TruynNode({ relayUrl });
  await requester.register({ name: 'long-poll-requester' });
  await provider.register({ name: 'long-poll-provider' });
  await provider.offer('long-poll.echo');

  const startedAt = Date.now();
  const pending = fetch(`${relayUrl}/v1/events?nodeId=${encodeURIComponent(provider.identity.nodeId)}&waitMs=1000`, {
    headers: { authorization: `Bearer ${provider.sessionToken}` }
  });

  await new Promise((resolve) => setTimeout(resolve, 80));
  const receipt = await requester.need('long-poll.echo', { value: 'wake-long-poll' });
  const response = await pending;
  const elapsedMs = Date.now() - startedAt;
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.ok(elapsedMs >= 60, `long-poll returned too early: ${elapsedMs}ms`);
  assert.equal(body.ok, true);
  assert.equal(body.events.length, 1);
  assert.equal(body.events[0].kind, 'NEED');
  assert.equal(body.events[0].envelope.id, receipt.needId);
  assert.equal(body.events[0].envelope.payload.input.value, 'wake-long-poll');
});

test('legacy /v1/events long-poll times out with an empty event list', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const node = new TruynNode({ relayUrl });
  await node.register({ name: 'long-poll-timeout' });

  const startedAt = Date.now();
  const response = await fetch(`${relayUrl}/v1/events?nodeId=${encodeURIComponent(node.identity.nodeId)}&waitMs=100`, {
    headers: { authorization: `Bearer ${node.sessionToken}` }
  });
  const elapsedMs = Date.now() - startedAt;
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.ok(elapsedMs >= 75, `long-poll timeout returned too early: ${elapsedMs}ms`);
  assert.deepEqual(body, { ok: true, events: [] });
});
