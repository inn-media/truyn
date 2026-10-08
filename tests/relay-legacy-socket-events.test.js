import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

test('legacy NEED and RESULT events use persistent socket while commands stay HTTP', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const requester = new TruynNode({ relayUrl });
  const provider = new TruynNode({ relayUrl });
  await requester.register({ name: 'legacy-socket-requester' });
  await provider.register({ name: 'legacy-socket-provider' });
  await provider.offer('legacy.socket.echo');

  await requester.ensureFastSocket();
  await provider.ensureFastSocket();

  const receipt = await requester.need('legacy.socket.echo', { value: 'socket-delivery' });
  const needEvent = await provider.nextSocketEvent({ timeoutMs: 2_000 });
  assert.equal(needEvent.kind, 'NEED');
  assert.equal(needEvent.envelope.id, receipt.needId);
  assert.equal(needEvent.verification.ok, true);

  await provider.result(receipt.needId, { ok: true }, { transport: 'http-command' });
  const resultEvent = await requester.nextSocketEvent({ timeoutMs: 2_000 });
  assert.equal(resultEvent.kind, 'RESULT');
  assert.equal(resultEvent.envelope.payload.requestId, receipt.needId);
  assert.deepEqual(resultEvent.envelope.payload.output, { ok: true });
  assert.equal(resultEvent.verification.ok, true);
});

test('legacy socket backpressure falls back to the bounded HTTP event queue without loss', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, maxSocketBufferedBytes: 1 });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const requester = new TruynNode({ relayUrl });
  const provider = new TruynNode({ relayUrl });
  await requester.register({ name: 'legacy-socket-pressure-requester' });
  await provider.register({ name: 'legacy-socket-pressure-provider' });
  await provider.offer('legacy.socket.pressure');
  await provider.ensureFastSocket();

  const receipt = await requester.need('legacy.socket.pressure', { payload: 'x'.repeat(100) });
  assert.ok(receipt.needId);
  const polled = await provider.poll({ waitMs: 0 });
  assert.equal(polled.events.length, 1, 'socket backpressure must preserve the legacy event in the bounded fallback queue');
  assert.equal(polled.events[0].kind, 'NEED');
  assert.equal(polled.events[0].envelope.id, receipt.needId);
});
