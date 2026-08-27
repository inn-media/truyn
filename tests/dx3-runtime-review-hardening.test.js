import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createOpenAIProvider } from '../adapters/providers/openai.js';

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

async function revokeRaw(node, targetId, targetKind, reason = 'stop') {
  const envelope = node.envelope('REVOKE', { targetId, targetKind, reason });
  const response = await fetch(`${node.relayUrl}/v1/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...node.authHeaders() },
    body: JSON.stringify({ envelope })
  });
  return { response, body: await response.json(), envelope };
}

test('terminal RESULT never evicts an acknowledged queued PARTIAL', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, maxQueuedEventsPerNode: 1 });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await provider.offer('review.terminal-order');
  const matched = await requester.compactNeed('review.terminal-order', {}, {}, { waitMs: 0 });
  const work = await provider.pollCompact({ waitMs: 0 });
  assert.equal(work.events[0].kind, 'NEED');

  const partial = await sendPartial(provider, matched.needId, 0, 'first');
  assert.equal(partial.response.status, 200);
  await provider.compactResult(matched.needId, 'done', {});

  const delivered = await requester.pollCompact({ waitMs: 0 });
  assert.equal(delivered.events.length, 2);
  assert.equal(delivered.events[0].kind, 'PARTIAL');
  assert.equal(delivered.events[0].payload.sequence, 0);
  assert.equal(delivered.events[1].kind, 'RESULT');
  assert.equal(delivered.events[1].payload.output, 'done');
});

test('NEED cancellation backpressures instead of dropping REVOKE and retry redelivers it', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, maxQueuedEventsPerNode: 1 });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await provider.offer('review.cancel-backpressure');
  const matched = await requester.need('review.cancel-backpressure', {});

  const blocked = await revokeRaw(requester, matched.needId, 'need');
  assert.equal(blocked.response.status, 429);
  assert.equal(blocked.body.error, 'cancellation_backpressure');
  assert.equal(relay.state.requests.get(matched.needId).status, 'cancelled');

  const work = await provider.poll();
  assert.equal(work.events.length, 1);
  assert.equal(work.events[0].kind, 'NEED');

  const retried = await revokeRaw(requester, matched.needId, 'need', 'stop-again');
  assert.equal(retried.response.status, 200);
  assert.equal(retried.body.idempotent, true);
  assert.equal(retried.body.redelivered, true);
  const cancellation = await provider.poll();
  assert.equal(cancellation.events.length, 1);
  assert.equal(cancellation.events[0].kind, 'REVOKE');
  assert.equal(cancellation.events[0].verification.ok, true);
});

test('OFFER and NEED revoke namespaces cannot shadow each other', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  const offered = await provider.offer('review.namespace');

  const payload = { capability: { name: 'review.namespace' }, input: {}, policy: {} };
  const frame = requester.compactFrame('NEED', payload, { id: offered.offerId });
  const needResponse = await fetch(`${relayUrl}/v1/fast/needs?waitMs=0`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...requester.authHeaders() },
    body: JSON.stringify({ frame, payload })
  });
  assert.equal(needResponse.status, 200);

  const ambiguousEnvelope = provider.envelope('REVOKE', { targetId: offered.offerId, reason: 'retire' });
  const ambiguousResponse = await fetch(`${relayUrl}/v1/revoke`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...provider.authHeaders() }, body: JSON.stringify({ envelope: ambiguousEnvelope })
  });
  const ambiguousBody = await ambiguousResponse.json();
  assert.equal(ambiguousResponse.status, 409);
  assert.equal(ambiguousBody.error, 'ambiguous_revoke_target');

  const offerRevoke = await revokeRaw(provider, offered.offerId, 'offer', 'retire');
  assert.equal(offerRevoke.response.status, 200);
  assert.equal(offerRevoke.body.targetKind, 'offer');
  const needCancel = await revokeRaw(requester, offered.offerId, 'need', 'cancel');
  assert.equal(needCancel.response.status, 200);
  assert.equal(needCancel.body.targetKind, 'need');
});

test('PARTIAL applies backpressure to a saturated requester WebSocket', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, maxSocketBufferedBytes: 1 });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await provider.offer('review.socket-backpressure');
  const matched = await requester.compactNeed('review.socket-backpressure', {}, {}, { waitMs: 0 });
  await requester.ensureFastSocket();

  const blocked = await sendPartial(provider, matched.needId, 0, 'cannot-fit-in-one-byte');
  assert.equal(blocked.response.status, 429);
  assert.equal(blocked.body.error, 'partial_backpressure');
  assert.equal(relay.state.requests.get(matched.needId).nextPartialSequence, 0);
});

test('scheduled adapter execution rejections are observed instead of becoming unhandled', async () => {
  const node = {
    async result() { throw new Error('terminal_transport_failure'); },
    closeFastSocket() {}
  };
  const host = new TruynAdapterHost({
    node,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    adapter: createFunctionAdapter({ name: 'review-rejection', capabilities: ['review.rejection'], execute: async () => ({ output: 'x' }) })
  });
  host.running = true;
  const event = {
    kind: 'NEED',
    verification: { ok: true },
    envelope: { id: 'review-rejection-1', from: 'requester', payload: { capability: { name: 'review.rejection' }, input: {} } }
  };
  const handled = host.handleLifecycleEvent(event);
  host.observeScheduled(handled);
  await until(() => host.lastExecutionError?.message === 'terminal_transport_failure');
  host.running = false;
  await Promise.allSettled([handled.promise]);
});

test('recoverable provider stop preserves dequeued in-flight and pending NEEDs for restart', async () => {
  const results = [];
  const runs = new Map();
  const node = {
    async result(requestId, output) { results.push({ requestId, output }); return { ok: true }; },
    closeFastSocket() {}
  };
  const host = new TruynAdapterHost({
    node,
    maxConcurrentExecutions: 1,
    maxPendingExecutions: 4,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    adapter: createFunctionAdapter({
      name: 'review-restart',
      capabilities: ['review.restart'],
      execute: async ({ need, signal }) => {
        const count = (runs.get(need.id) || 0) + 1;
        runs.set(need.id, count);
        if (need.id === 'restart-1' && count === 1) {
          await new Promise((resolve) => {
            if (signal.aborted) return resolve();
            signal.addEventListener('abort', resolve, { once: true });
          });
        }
        return { output: `${need.id}:${count}` };
      }
    })
  });
  const event = (id) => ({
    kind: 'NEED', verification: { ok: true },
    envelope: { id, from: 'requester', payload: { capability: { name: 'review.restart' }, input: {} } }
  });

  host.running = true;
  host.handleLifecycleEvent(event('restart-1'));
  host.handleLifecycleEvent(event('restart-2'));
  await until(() => host.inFlight.size === 1 && host.pendingNeeds.length === 1);
  await host.stop({ preserveDequeuedWork: true });
  assert.equal(host.inFlight.size, 0);
  assert.equal(host.pendingNeeds.length, 2);

  host.running = true;
  host.drainPendingNeeds();
  await until(() => results.length === 2);
  assert.deepEqual(results.map((item) => item.requestId), ['restart-1', 'restart-2']);
  host.running = false;
});

test('production provider retry preserves dequeued work', () => {
  const source = readFileSync(new URL('../runtime/service.js', import.meta.url), 'utf8');
  assert.match(source, /adapterHost\.stop\(\{ preserveDequeuedWork: true \}\)/);
});

test('built-in OpenAI provider propagates the lifecycle AbortSignal to upstream fetch', async () => {
  const controller = new AbortController();
  let observedSignal = null;
  const provider = createOpenAIProvider({
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl: async (_url, options) => {
      observedSignal = options.signal;
      return {
        ok: true,
        status: 200,
        async json() { return { id: 'provider-request', model: 'test-model', output_text: 'ok', usage: {} }; }
      };
    }
  });
  const result = await provider.execute({ capability: 'review.signal', input: 'x', policy: {}, signal: controller.signal });
  assert.equal(result.output, 'ok');
  assert.equal(observedSignal, controller.signal);
});
