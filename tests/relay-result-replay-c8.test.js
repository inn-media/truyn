import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

test('C8 legacy RESULT replay fails closed before stats or requester queue mutate twice', async (t) => {
  const relay = createRelay({
    localDevelopmentMode: false,
    allowPublicRegistration: true,
    allowPublicDispatch: true
  });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const requester = new TruynNode({ relayUrl, identity: createIdentity() });
  const provider = new TruynNode({ relayUrl, identity: createIdentity() });
  await requester.register({ name: 'c8-requester' });
  await provider.register({ name: 'c8-provider' });
  await provider.offer('c8.legacy.replay', { accessMode: 'public' });

  const submitted = await requester.need('c8.legacy.replay', { prompt: 'exactly once' });
  const request = relay.state.requests.get(submitted.needId);
  assert.equal(request.status, 'matched');
  assert.equal(request.provider, provider.identity.nodeId);

  await provider.result(submitted.needId, { answer: 'first' });
  assert.equal(request.status, 'completed');
  assert.equal(relay.state.stats.get(provider.identity.nodeId).successfulTasks, 1);

  const firstPoll = await requester.poll();
  const firstResults = firstPoll.events.filter((event) => event.kind === 'RESULT');
  assert.equal(firstResults.length, 1);
  assert.equal(firstResults[0].envelope.payload.requestId, submitted.needId);
  assert.deepEqual(firstResults[0].envelope.payload.output, { answer: 'first' });

  await assert.rejects(
    provider.result(submitted.needId, { answer: 'replayed' }),
    (error) => error.status === 409 && error.body?.error === 'request_already_completed'
  );

  assert.equal(request.status, 'completed');
  assert.equal(relay.state.stats.get(provider.identity.nodeId).successfulTasks, 1, 'duplicate RESULT must not increment provider success twice');
  const secondPoll = await requester.poll();
  assert.deepEqual(secondPoll.events, [], 'duplicate RESULT must not enqueue a second requester event');
});
