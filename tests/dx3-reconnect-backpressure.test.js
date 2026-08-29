import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('saturated reconnect preserves queued terminal events instead of overfilling the socket buffer', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, maxSocketBufferedBytes: 1 });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await provider.offer('review.reconnect-terminal-backpressure');

  const matched = await requester.compactNeed('review.reconnect-terminal-backpressure', {}, {}, { waitMs: 0 });
  const work = await provider.pollCompact({ waitMs: 0 });
  assert.equal(work.events[0].kind, 'NEED');
  await provider.compactResult(matched.needId, 'done', {});

  const requesterId = requester.identity.nodeId;
  assert.equal(relay.state.fastTerminalEvents.get(requesterId)?.length, 1);

  await requester.ensureFastSocket().catch(() => {});
  await delay(25);

  assert.equal(relay.state.fastTerminalEvents.get(requesterId)?.length, 1);
  assert.notEqual(relay.state.providerSockets.get(requesterId)?.readyState, 1);
  requester.closeFastSocket?.();

  const delivered = await requester.pollCompact({ waitMs: 0 });
  assert.equal(delivered.events.length, 1);
  assert.equal(delivered.events[0].kind, 'RESULT');
  assert.equal(delivered.events[0].payload.output, 'done');
});
