import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(predicate, { timeoutMs = 2_000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await delay(intervalMs);
  }
  throw new Error('condition_timeout');
}

async function sendPartial(node, requestId, sequence, delta = `chunk-${sequence}`) {
  const payload = { sequence, delta, metadata: {} };
  const frame = node.compactFrame('PARTIAL', payload, { id: requestId });
  const response = await fetch(`${node.relayUrl}/v1/fast/partials`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...node.authHeaders() },
    body: JSON.stringify({ frame, payload })
  });
  return { response, body: await response.json() };
}

test('PARTIAL backpressures before sequence advance when requester fast queue is full', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, maxQueuedEventsPerNode: 1 });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await provider.offer('stream.backpressure');
  const matched = await requester.compactNeed('stream.backpressure', {}, {}, { waitMs: 0 });

  const first = await sendPartial(provider, matched.needId, 0, 'first');
  assert.equal(first.response.status, 200);
  assert.equal(relay.state.requests.get(matched.needId).nextPartialSequence, 1);

  const blocked = await sendPartial(provider, matched.needId, 1, 'second');
  assert.equal(blocked.response.status, 429);
  assert.equal(blocked.body.error, 'partial_backpressure');
  assert.equal(blocked.body.expected, 1);
  assert.equal(relay.state.requests.get(matched.needId).nextPartialSequence, 1);

  const drained = await requester.pollCompact({ waitMs: 0 });
  assert.equal(drained.events.length, 1);
  assert.equal(drained.events[0].kind, 'PARTIAL');
  assert.equal(drained.events[0].payload.sequence, 0);

  const retried = await sendPartial(provider, matched.needId, 1, 'second');
  assert.equal(retried.response.status, 200);
  assert.equal(relay.state.requests.get(matched.needId).nextPartialSequence, 2);
});

test('idempotent NEED cancellation redelivers REVOKE after provider consumed the first notification', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await provider.offer('cancel.redelivery');
  const matched = await requester.need('cancel.redelivery', {});

  const work = await provider.poll();
  assert.equal(work.events.length, 1);
  assert.equal(work.events[0].kind, 'NEED');

  await requester.revoke(matched.needId, 'stop');
  const firstCancellation = await provider.poll();
  assert.equal(firstCancellation.events.length, 1);
  assert.equal(firstCancellation.events[0].kind, 'REVOKE');
  assert.equal(firstCancellation.events[0].verification.ok, true);

  const retried = await requester.revoke(matched.needId, 'stop_again');
  assert.equal(retried.idempotent, true);
  assert.equal(retried.redelivered, true);
  const secondCancellation = await provider.poll();
  assert.equal(secondCancellation.events.length, 1);
  assert.equal(secondCancellation.events[0].kind, 'REVOKE');
  assert.equal(secondCancellation.events[0].verification.ok, true);
  assert.equal(secondCancellation.events[0].envelope.payload.targetId, matched.needId);
});

test('control polling retries after a transient failure instead of silently ending', async (t) => {
  let controlPolls = 0;
  const node = {
    sessionToken: null,
    async register() {
      this.sessionToken = 'session';
      return { sessionToken: this.sessionToken };
    },
    async offer() { return { offerId: 'offer-control-retry' }; },
    async poll() {
      controlPolls += 1;
      if (controlPolls === 1) throw Object.assign(new Error('temporary relay failure'), { code: 'ECONNRESET' });
      await delay(2);
      return { events: [] };
    },
    async pollCompact() {
      await delay(2);
      return { events: [] };
    },
    closeFastSocket() {}
  };
  const host = new TruynAdapterHost({
    node,
    fastPath: true,
    socketPath: false,
    longPollMs: 1,
    cancelPollMs: 10,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    adapter: createFunctionAdapter({ name: 'control-retry', capabilities: ['control.retry'], execute: async () => ({ output: 'ok' }) })
  });
  t.after(() => host.stop());

  await host.start();
  await until(() => controlPolls >= 2 && host.lastControlError === null);
  assert.equal(host.running, true);
  assert.equal(host.controlLoopPromise instanceof Promise, true);
  assert.equal(host.lastControlError, null);
});

test('lifecycle host bounds concurrent adapter execution and pending work', async () => {
  let active = 0;
  let maxActive = 0;
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const results = [];
  const node = {
    async result(requestId, output, metadata) {
      results.push({ requestId, output, metadata });
      return { ok: true };
    }
  };
  const host = new TruynAdapterHost({
    node,
    maxConcurrentExecutions: 1,
    maxPendingExecutions: 1,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    adapter: createFunctionAdapter({
      name: 'bounded-work',
      capabilities: ['bounded.work'],
      execute: async ({ need }) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        try {
          if (need.id === 'need-1') await firstGate;
          return { output: need.id };
        } finally {
          active -= 1;
        }
      }
    })
  });
  host.running = true;

  const event = (id) => ({
    kind: 'NEED',
    verification: { ok: true },
    envelope: { id, from: 'requester', payload: { capability: { name: 'bounded.work' }, input: {} } }
  });
  const first = host.handleLifecycleEvent(event('need-1'));
  const second = host.handleLifecycleEvent(event('need-2'));
  const overflow = host.handleLifecycleEvent(event('need-3'));

  await until(() => host.inFlight.size === 1 && host.pendingNeeds.length === 1 && results.some((item) => item.requestId === 'need-3'));
  assert.equal(host.inFlight.size, 1);
  assert.equal(host.pendingNeeds.length, 1);
  assert.equal(results.find((item) => item.requestId === 'need-3').metadata.error, 'PROVIDER_BUSY');

  releaseFirst();
  await Promise.all([first.promise, second.promise, overflow.promise]);
  await until(() => results.some((item) => item.requestId === 'need-2'));
  assert.equal(maxActive, 1);
  assert.equal(host.inFlight.size, 0);
  assert.equal(host.pendingNeeds.length, 0);
  host.running = false;
});
