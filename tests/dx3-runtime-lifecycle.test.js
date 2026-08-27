import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';

async function until(predicate, { timeoutMs = 2_000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
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
  return { response, body: await response.json(), frame, payload };
}

test('DX-3 lifecycle is integrated in production modules without duplicate base implementations', () => {
  assert.equal(existsSync(new URL('../network/relay/server-base.js', import.meta.url)), false);
  assert.equal(existsSync(new URL('../adapters/sdk/base.js', import.meta.url)), false);
});

test('PARTIAL compact frames use the stable T wire code', () => {
  const node = new TruynNode({ relayUrl: 'http://127.0.0.1:1' });
  const payload = { sequence: 0, delta: 'x', metadata: {} };
  const frame = node.compactFrame('PARTIAL', payload, { id: 'partial-wire-code' });
  assert.equal(frame.t, 'T');
});

test('requester-owned REVOKE cancels a dispatched NEED, is signed/idempotent, and rejects late RESULT', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  const attacker = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await attacker.register();
  await provider.offer('cancel.legacy');

  const matched = await requester.need('cancel.legacy', { value: 1 });
  await assert.rejects(() => attacker.revoke(matched.needId, 'not_mine'), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.body.error, 'not_request_owner');
    return true;
  });

  const cancelled = await requester.revoke(matched.needId, 'user_cancelled');
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.targetKind, 'need');
  const repeated = await requester.revoke(matched.needId, 'user_cancelled');
  assert.equal(repeated.idempotent, true);

  const providerEvents = await provider.poll();
  assert.equal(providerEvents.events.length, 2);
  assert.equal(providerEvents.events[0].kind, 'NEED');
  assert.equal(providerEvents.events[1].kind, 'REVOKE');
  assert.equal(providerEvents.events[1].verification.ok, true);
  assert.equal(providerEvents.events[1].envelope.payload.targetId, matched.needId);
  assert.equal(relay.state.requests.get(matched.needId).status, 'cancelled');

  await assert.rejects(() => provider.result(matched.needId, { late: true }), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.body.error, 'request_cancelled');
    return true;
  });
});

test('REVOKE preserves OFFER ownership and visibility semantics', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  const attacker = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await attacker.register();
  const offered = await provider.offer('revoke.offer');

  await assert.rejects(() => attacker.revoke(offered.offerId, 'not_mine'), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.body.error, 'not_target_owner');
    return true;
  });
  const revoked = await provider.revoke(offered.offerId, 'retired');
  assert.equal(revoked.targetId, offered.offerId);
  const discovered = await requester.find('revoke.offer');
  assert.equal(discovered.offers.length, 0);
});

test('cancelling an already-open compact NEED wakes its waitMs waiter immediately', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await provider.offer('cancel.waiter');

  const requestId = 'dx3-cancel-waiter';
  const payload = { capability: { name: 'cancel.waiter' }, input: { value: 1 }, policy: {} };
  const frame = requester.compactFrame('NEED', payload, { id: requestId });
  const startedAt = Date.now();
  const waitingResponse = fetch(`${relayUrl}/v1/fast/needs?waitMs=5000`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...requester.authHeaders() },
    body: JSON.stringify({ frame, payload })
  });

  await until(() => relay.state.requests.has(requestId));
  const cancelled = await requester.revoke(requestId, 'user_cancelled');
  assert.equal(cancelled.cancelled, true);

  const response = await waitingResponse;
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error, 'request_cancelled');
  assert.equal(body.requestId, requestId);
  assert.ok(Date.now() - startedAt < 2_000, 'cancellation must resolve the waiter before its 5s timeout');

  const providerEvents = await provider.poll();
  assert.equal(providerEvents.events[0].kind, 'NEED');
  assert.equal(providerEvents.events[1].kind, 'REVOKE');
  assert.equal(providerEvents.events[1].verification.ok, true);
});

test('TruynAdapterHost keeps reading control events while execute runs and aborts cooperatively', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  let observedSignal = null;
  let abortObserved = false;
  let executionStartedResolve;
  const executionStarted = new Promise((resolve) => { executionStartedResolve = resolve; });

  const host = new TruynAdapterHost({
    node: provider,
    fastPath: true,
    socketPath: false,
    longPollMs: 50,
    cancelPollMs: 10,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    adapter: createFunctionAdapter({
      name: 'cancel-host',
      capabilities: ['cancel.fast'],
      execute: async ({ signal }) => {
        observedSignal = signal;
        executionStartedResolve();
        await new Promise((resolve) => {
          if (signal.aborted) return resolve();
          signal.addEventListener('abort', () => {
            abortObserved = true;
            resolve();
          }, { once: true });
        });
        return { output: 'must-not-be-delivered' };
      }
    })
  });
  t.after(() => host.stop());

  await host.start();
  await requester.register();
  const matched = await requester.compactNeed('cancel.fast', { value: 1 }, {}, { waitMs: 0 });
  await executionStarted;
  assert.ok(observedSignal instanceof AbortSignal);
  assert.equal(observedSignal.aborted, false);

  await requester.revoke(matched.needId, 'stop_inference');
  await until(() => abortObserved && observedSignal.aborted);
  await until(() => !host.inFlight.has(matched.needId));
  assert.equal(relay.state.requests.get(matched.needId).status, 'cancelled');

  const events = await requester.pollCompact({ waitMs: 0 });
  assert.equal(events.events.some((event) => event.kind === 'RESULT'), false);
  await assert.rejects(() => provider.compactResult(matched.needId, { late: true }), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.body.error, 'request_cancelled');
    return true;
  });
});

test('signed PARTIAL frames are correlated, strictly sequenced, and terminate with RESULT', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  const attacker = new TruynNode({ relayUrl });
  const host = new TruynAdapterHost({
    node: provider,
    fastPath: true,
    socketPath: false,
    longPollMs: 50,
    cancelPollMs: 10,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    adapter: createFunctionAdapter({
      name: 'stream-host',
      capabilities: ['stream.fast'],
      execute: async ({ emitPartial }) => {
        await emitPartial('Hel', { tokenCount: 1 });
        await emitPartial('lo', { tokenCount: 1 });
        return { output: 'Hello' };
      }
    })
  });
  t.after(() => host.stop());
  t.after(() => requester.closeFastSocket());

  await host.start();
  await requester.register();
  await attacker.register();
  await requester.ensureFastSocket();
  const matched = await requester.compactNeed('stream.fast', { prompt: 'hello' }, {}, { waitMs: 0 });

  const first = await requester.nextCompactSocketEvent({ timeoutMs: 2_000 });
  const second = await requester.nextCompactSocketEvent({ timeoutMs: 2_000 });
  const terminal = await requester.nextCompactSocketEvent({ timeoutMs: 2_000 });
  assert.equal(first.kind, 'PARTIAL');
  assert.equal(first.verification.ok, true);
  assert.equal(first.frame.i, matched.needId);
  assert.equal(first.payload.sequence, 0);
  assert.equal(first.payload.delta, 'Hel');
  assert.equal(second.kind, 'PARTIAL');
  assert.equal(second.verification.ok, true);
  assert.equal(second.payload.sequence, 1);
  assert.equal(second.payload.delta, 'lo');
  assert.equal(terminal.kind, 'RESULT');
  assert.equal(terminal.verification.ok, true);
  assert.equal(terminal.payload.output, 'Hello');
  assert.equal(terminal.payload.metadata.partialCount, 2);
  assert.equal(relay.state.requests.get(matched.needId).status, 'completed');

  const afterTerminal = await sendPartial(provider, matched.needId, 2, '!');
  assert.equal(afterTerminal.response.status, 409);
  assert.equal(afterTerminal.body.error, 'request_already_completed');

  const foreign = await sendPartial(attacker, matched.needId, 2, 'evil');
  assert.equal(foreign.response.status, 403);
  assert.equal(foreign.body.error, 'provider_mismatch');
});

test('relay rejects out-of-order PARTIAL sequence without advancing or emitting it', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await provider.offer('stream.sequence');
  const matched = await requester.compactNeed('stream.sequence', {}, {}, { waitMs: 0 });

  const wrong = await sendPartial(provider, matched.needId, 1, 'out-of-order');
  assert.equal(wrong.response.status, 409);
  assert.equal(wrong.body.error, 'partial_sequence_mismatch');
  assert.equal(wrong.body.expected, 0);
  assert.equal(relay.state.requests.get(matched.needId).nextPartialSequence, 0);

  const right = await sendPartial(provider, matched.needId, 0, 'first');
  assert.equal(right.response.status, 200);
  const polled = await requester.pollCompact({ waitMs: 0 });
  assert.equal(polled.events.length, 1);
  assert.equal(polled.events[0].kind, 'PARTIAL');
  assert.equal(polled.events[0].payload.sequence, 0);
  assert.equal(polled.events[0].verification.ok, true);
});
