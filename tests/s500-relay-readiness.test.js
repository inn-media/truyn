import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

async function setup(t, capabilities, options = {}) {
  const relay = createRelay({ localDevelopmentMode: true, ...options });
  const url = await relay.listen({ port: 0 });
  const requester = new TruynNode({ relayUrl: url, identity: createIdentity() });
  await requester.register();
  const providers = [];
  for (const [capability, metadata = {}] of capabilities) {
    const node = new TruynNode({ relayUrl: url, identity: createIdentity() });
    await node.register();
    await node.offer(capability, metadata);
    providers.push(node);
  }
  t.after(async () => { for (const node of providers) node.close?.(); requester.close?.(); await relay.close(); });
  return { relay, requester, providers };
}

test('S-500: one requester can hold more fast NEEDs in flight than the per-node queue depth', async (t) => {
  const depth = 4;
  const burst = 10;
  // Historical coupling: reservations capped by maxQueuedEventsPerNode -> 429 terminal_backpressure.
  {
    const { requester } = await setup(t, [['bench.a', { capacity: { maxInFlight: 64 } }]], { maxQueuedEventsPerNode: depth });
    const outcomes = await Promise.allSettled(Array.from({ length: burst }, (_, i) => requester.compactNeed('bench.a', { i }, {}, { waitMs: 0 })));
    assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, depth);
    assert.match(String(outcomes.find((o) => o.status === 'rejected').reason), /terminal_backpressure|429/);
  }
  {
    const { requester } = await setup(t, [['bench.b', { capacity: { maxInFlight: 64 } }]], {
      maxQueuedEventsPerNode: depth, maxFastTerminalReservationsPerRequester: burst
    });
    const outcomes = await Promise.allSettled(Array.from({ length: burst }, (_, i) => requester.compactNeed('bench.b', { i }, {}, { waitMs: 0 })));
    assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, burst);
  }
});

test('S-500: capability index matches only offers of the requested capability', async (t) => {
  const caps = Array.from({ length: 30 }, (_, i) => [`bench.node-${i}`]);
  const { relay, requester, providers } = await setup(t, caps);
  for (let i = 0; i < 30; i += 7) {
    const got = await requester.compactNeed(`bench.node-${i}`, { i }, {}, { waitMs: 0 });
    assert.equal(got.provider, providers[i].identity.nodeId);
  }
  await assert.rejects(requester.compactNeed('bench.unknown', {}, {}, { waitMs: 0 }), /no_matching_provider|404/);
  assert.equal(relay.state.offers.size, 30);
});

test('S-500: provider-signalled cooldown (upstream 429) deprioritises only that provider', async (t) => {
  const { requester, providers } = await setup(t, [
    ['bench.llm', { pricing: { inputUsdPerMTok: 0.3, outputUsdPerMTok: 1.2 }, capacity: { maxInFlight: 8 } }],
    ['bench.llm', { pricing: { inputUsdPerMTok: 15, outputUsdPerMTok: 75 }, capacity: { maxInFlight: 8 } }]
  ]);
  const [cheap, premium] = providers;
  const first = await requester.compactNeed('bench.llm', { i: 0 }, {}, { waitMs: 0 });
  assert.equal(first.provider, cheap.identity.nodeId);
  await cheap.compactResult(first.needId, { ok: true }, { capacity: { cooldownMs: 5_000 } });
  const second = await requester.compactNeed('bench.llm', { i: 1 }, {}, { waitMs: 0 });
  assert.equal(second.provider, premium.identity.nodeId, 'cooling provider must yield to an available one');
});

test('S-500: invalid knobs fail closed', () => {
  assert.throws(() => createRelay({ localDevelopmentMode: true, maxFastTerminalReservationsPerRequester: 0 }), /maxFastTerminalReservationsPerRequester/);
  assert.throws(() => createRelay({ localDevelopmentMode: true, socketHeartbeatIntervalMs: 10 }), /socketHeartbeatIntervalMs/);
});
