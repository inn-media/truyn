import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createHttpAdapterServer } from '../adapters/http/server.js';

function parseSse(text) {
  return text.split('\n\n').filter(Boolean).map((block) => {
    const lines = block.split('\n');
    const event = lines.find((line) => line.startsWith('event: '))?.slice(7);
    const id = lines.find((line) => line.startsWith('id: '))?.slice(4);
    const data = JSON.parse(lines.find((line) => line.startsWith('data: '))?.slice(6) || 'null');
    return { event, id, data };
  });
}

test('REST need event stream is requester-scoped, bounded, canonical and non-executing', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const requester = new TruynNode({ relayUrl });
  const provider = new TruynNode({ relayUrl });
  const foreign = new TruynNode({ relayUrl });
  await requester.register({ name: 'stream-requester' });
  await provider.register({ name: 'stream-provider' });
  await foreign.register({ name: 'stream-foreign' });
  await provider.offer('stream.echo');

  const need = await requester.need('stream.echo', { value: 'one-execution' });
  const requesterBridge = createHttpAdapterServer({ node: requester });
  const requesterUrl = await requesterBridge.listen({ port: 0 });
  t.after(() => requesterBridge.close());

  const pending = await fetch(`${requesterUrl}/v1/needs/${encodeURIComponent(need.needId)}/events`, {
    headers: { 'x-correlation-id': 'rest-stream-fixture' }
  });
  assert.equal(pending.status, 200);
  assert.match(pending.headers.get('content-type'), /^text\/event-stream/);
  assert.equal(pending.headers.get('x-correlation-id'), 'rest-stream-fixture');
  assert.deepEqual(parseSse(await pending.text()), []);

  await provider.result(need.needId, { answer: 'accepted' }, { partialCount: 0 });

  const completed = await fetch(`${requesterUrl}/v1/needs/${encodeURIComponent(need.needId)}/events`);
  assert.equal(completed.status, 200);
  const events = parseSse(await completed.text());
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'result');
  assert.equal(events[0].id, `${need.needId}:result`);
  assert.equal(events[0].data.kind, 'RESULT');
  assert.equal(events[0].data.requestId, need.needId);
  assert.equal(events[0].data.envelope.payload.requestId, need.needId);
  assert.deepEqual(events[0].data.envelope.payload.output, { answer: 'accepted' });

  const repeated = await fetch(`${requesterUrl}/v1/needs/${encodeURIComponent(need.needId)}/events`);
  assert.deepEqual(parseSse(await repeated.text()), events, 'stream reads must not consume or synthesize canonical request state');

  const foreignBridge = createHttpAdapterServer({ node: foreign });
  const foreignUrl = await foreignBridge.listen({ port: 0 });
  t.after(() => foreignBridge.close());
  const denied = await fetch(`${foreignUrl}/v1/needs/${encodeURIComponent(need.needId)}/events`);
  assert.equal(denied.status, 404);
  const deniedBody = await denied.json();
  assert.equal(deniedBody.ok, false);
  assert.equal(deniedBody.error.code, 'not_found');

  const canonical = await requester.requestStatus(need.needId);
  assert.equal(canonical.status, 'completed');
  assert.deepEqual(canonical.result.envelope.payload.output, { answer: 'accepted' });
});
