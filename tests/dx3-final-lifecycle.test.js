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

test('fast NEED cancellation is delivered on the fast lifecycle stream without a control poll loop', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  let started = false;
  let aborted = false;

  const host = new TruynAdapterHost({
    node: provider,
    fastPath: true,
    socketPath: false,
    longPollMs: 1_000,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    adapter: createFunctionAdapter({
      name: 'final-fast-cancel',
      capabilities: ['final.fast.cancel'],
      execute: async ({ signal }) => {
        started = true;
        await new Promise((resolve) => {
          if (signal.aborted) return resolve();
          signal.addEventListener('abort', () => {
            aborted = true;
            resolve();
          }, { once: true });
        });
        return { output: 'must-not-be-delivered' };
      }
    })
  });

  t.after(async () => {
    await host.stop();
    await relay.close();
  });

  await requester.register();
  await host.start();
  assert.equal(host.controlLoopPromise, null);

  const matched = await requester.compactNeed('final.fast.cancel', {}, {}, { waitMs: 0 });
  await until(() => started);
  const cancelled = await requester.revoke(matched.needId, 'stop-now', { targetKind: 'need' });
  assert.equal(cancelled.cancelled, true);

  await until(() => aborted);
  assert.equal(host.cancelledNeedIds.get(matched.needId)?.from, requester.identity.nodeId);
  assert.equal(relay.state.requests.get(matched.needId)?.status, 'cancelled');
});

test('fatal fast work-loop failure stops the host visibly and closes transport activity', async () => {
  let closed = 0;
  const node = {
    sessionToken: null,
    async register() { this.sessionToken = 'test-session'; return { ok: true }; },
    async offer() { return { offerId: 'offer-final-fatal' }; },
    async pollCompact() { throw new Error('fast_poll_failed'); },
    closeFastSocket() { closed += 1; }
  };
  const host = new TruynAdapterHost({
    node,
    fastPath: true,
    socketPath: false,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    adapter: createFunctionAdapter({ name: 'final-fatal', capabilities: ['final.fatal'], execute: async () => ({ output: 'x' }) })
  });

  await host.start();
  await assert.rejects(host.loopPromise, /fast_poll_failed/);
  assert.equal(host.running, false);
  assert.equal(host.controlLoopPromise, null);
  assert.equal(host.lastLoopError?.message, 'fast_poll_failed');
  assert.ok(closed >= 1);
});

test('abandoned fast NEED expires, releases its terminal reservation, and rejects late provider output', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, maxQueuedEventsPerNode: 1, requestTtlMs: 25 });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await provider.offer('final.expiry');

  const matched = await requester.compactNeed('final.expiry', {}, {}, { waitMs: 0 });
  const work = await provider.pollCompact({ waitMs: 0 });
  assert.equal(work.events[0].kind, 'NEED');
  assert.equal(relay.state.fastTerminalReservations.get(requester.identity.nodeId), 1);

  await delay(40);
  const health = await fetch(`${relayUrl}/health`);
  assert.equal(health.status, 200);
  assert.equal(relay.state.requests.get(matched.needId)?.status, 'failed');
  assert.equal(relay.state.requests.get(matched.needId)?.failureReason, 'request_expired');
  assert.equal(relay.state.fastTerminalReservations.get(requester.identity.nodeId) || 0, 0);

  await assert.rejects(
    () => provider.compactResult(matched.needId, 'late-result', {}),
    (error) => error?.status === 409 && error?.body?.error === 'request_failed'
  );

  const partialPayload = { sequence: 0, delta: 'late-partial', metadata: {} };
  const partialFrame = provider.compactFrame('PARTIAL', partialPayload, { id: matched.needId });
  const partialResponse = await fetch(`${relayUrl}/v1/fast/partials`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...provider.authHeaders() },
    body: JSON.stringify({ frame: partialFrame, payload: partialPayload })
  });
  const partialBody = await partialResponse.json();
  assert.equal(partialResponse.status, 409);
  assert.equal(partialBody.error, 'request_failed');

  const next = await requester.compactNeed('final.expiry', {}, {}, { waitMs: 0 });
  assert.equal(next.ok, true);
  assert.equal(relay.state.fastTerminalReservations.get(requester.identity.nodeId), 1);
});

test('TruynNode revoke defaults to OFFER namespace and NEED cancellation is explicit', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  const offered = await provider.offer('final.namespace');
  const offerRevoked = await provider.revoke(offered.offerId);
  assert.equal(offerRevoked.targetKind, 'offer');

  const liveOffer = await provider.offer('final.namespace');
  assert.ok(liveOffer.offerId);
  const matched = await requester.compactNeed('final.namespace', {}, {}, { waitMs: 0 });
  const needCancelled = await requester.revoke(matched.needId, 'cancel', { targetKind: 'need' });
  assert.equal(needCancelled.targetKind, 'need');
  assert.equal(needCancelled.cancelled, true);
});
