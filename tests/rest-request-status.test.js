import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createHttpAdapterServer } from '../adapters/http/server.js';

test('REST request status uses canonical requester-scoped legacy relay state and accepted RESULT', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const requester = new TruynNode({ relayUrl });
  const provider = new TruynNode({ relayUrl });
  const foreign = new TruynNode({ relayUrl });
  await requester.register({ name: 'requester' });
  await provider.register({ name: 'provider' });
  await foreign.register({ name: 'foreign' });
  await provider.offer('status.echo');

  const need = await requester.need('status.echo', { value: 'pending' });
  const pending = await requester.requestStatus(need.needId);
  assert.equal(pending.ok, true);
  assert.equal(pending.requestId, need.needId);
  assert.equal(pending.status, 'matched');
  assert.equal(pending.provider, provider.identity.nodeId);
  assert.equal(pending.capability, 'status.echo');
  assert.equal(pending.result, null);

  await assert.rejects(
    () => foreign.requestStatus(need.needId),
    (error) => error.status === 404 && error.body?.error === 'request_not_found'
  );
  await assert.rejects(
    () => requester.requestStatus('missing-request-id'),
    (error) => error.status === 404 && error.body?.error === 'request_not_found'
  );

  await provider.result(need.needId, { answer: 'accepted' }, { fixture: true });
  const events = await requester.poll();
  assert.equal(events.events.filter((event) => event.kind === 'RESULT').length, 1);

  const completed = await requester.requestStatus(need.needId);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.result.envelope.payload.requestId, need.needId);
  assert.deepEqual(completed.result.envelope.payload.output, { answer: 'accepted' });
  assert.deepEqual(completed.result.envelope.payload.metadata, { fixture: true });
  assert.ok(completed.result.trust);

  const bridge = createHttpAdapterServer({ node: requester });
  const baseUrl = await bridge.listen({ port: 0 });
  t.after(() => bridge.close());

  const first = await fetch(`${baseUrl}/v1/needs/${encodeURIComponent(need.needId)}`);
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.status, 'completed');
  assert.deepEqual(firstBody.result.envelope.payload.output, { answer: 'accepted' });

  const second = await fetch(`${baseUrl}/v1/needs/${encodeURIComponent(need.needId)}`);
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), firstBody, 'adapter must re-read canonical relay state rather than synthesize local status');
});

test('legacy request status refuses compact request records instead of conflating modes', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const requester = new TruynNode({ relayUrl });
  const provider = new TruynNode({ relayUrl });
  await requester.register();
  await provider.register();
  await provider.offer('status.compact');
  const compact = await requester.compactNeed('status.compact', { value: 1 }, {}, { waitMs: 0 });

  await assert.rejects(
    () => requester.requestStatus(compact.needId),
    (error) => error.status === 409 && error.body?.error === 'request_status_requires_legacy_need'
  );
});
