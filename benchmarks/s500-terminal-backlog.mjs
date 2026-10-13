// HTTP-only, zero inference: do not read any RESULT until all 500 are queued.
// A WebSocket consumer or a continuously polling requester hides this boundary.
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { TruynNode } from '../node/client.js';
const { createRelay } = await import(process.env.S500_DRY_RELAY_MODULE || '../network/relay/server.js');
const count = 500;
const relay = createRelay({ localDevelopmentMode: true, maxNodes: 1024, maxOffers: 8192,
  maxFastTerminalReservationsPerRequester: 1024 });
const url = await relay.listen({ port: 0 });
const requester = new TruynNode({ relayUrl: url, identity: createIdentity() });
const providers = [];
try {
  await requester.register();
  for (let i = 0; i < 8; i++) {
    const provider = new TruynNode({ relayUrl: url, identity: createIdentity() });
    await provider.register();
    await provider.offer('dry.terminal-backlog', { capacity: { maxInFlight: 128 } });
    providers.push(provider);
  }
  const receipts = await Promise.all(Array.from({ length: count }, (_, i) =>
    requester.compactNeed('dry.terminal-backlog', { i }, {}, { waitMs: 0 })));
  assert.equal(new Set(receipts.map(r => r.needId)).size, count);
  const results = [];
  let needs = 0;
  for (const provider of providers) {
    const batch = await provider.pollCompact({ waitMs: 0 });
    assert(batch.events.length <= 256);
    for (const event of batch.events) {
      assert.equal(event.kind, 'NEED');
      assert(event.verification.ok);
      needs++;
      results.push(provider.compactResult(event.frame.i, event.payload.input, { simulated: true, paidCalls: 0 }));
    }
  }
  assert.equal(needs, count);
  const settled = await Promise.allSettled(results);
  assert.equal(settled.filter(r => r.status === 'fulfilled').length, count,
    JSON.stringify(settled.filter(r => r.status === 'rejected').slice(0, 3).map(r => String(r.reason))));
  assert.equal(relay.state.fastTerminalEvents.get(requester.identity.nodeId).length, count);
  assert.equal(relay.state.fastTerminalReservations.get(requester.identity.nodeId) || 0, 0);
  const received = await requester.pollCompact({ waitMs: 0 });
  assert.equal(received.events.length, count);
  const expected = new Map(receipts.map((r, i) => [r.needId, { provider: r.provider, i }]));
  const seen = new Set();
  for (const event of received.events) {
    assert.equal(event.kind, 'RESULT');
    assert(event.verification.ok);
    assert.equal(event.from, expected.get(event.frame.i).provider);
    assert.equal(event.payload.output.i, expected.get(event.frame.i).i);
    assert(!seen.has(event.frame.i));
    seen.add(event.frame.i);
  }
  assert.equal((await requester.pollCompact({ waitMs: 0 })).events.length, 0);
  console.log(JSON.stringify({ schema: 'truyn.s500.http-terminal-backlog/v1', status: 'PASS',
    accepted: count, completed: count, queuedBeforeRead: count, verifiedUniqueResults: seen.size,
    terminalCapacity: 1024, providerQueueLimit: 256, transport: 'http', paidCalls: 0 }));
} finally {
  for (const p of providers) p.close?.();
  requester.close?.();
  await relay.close();
}
