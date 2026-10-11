import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

async function post(node, path, body) {
  const response = await fetch(node.relayUrl + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...node.authHeaders() },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

function needEnvelope(node, id, capability) {
  return node.envelope('NEED', {
    capability: { name: capability }, input: { test: true }, policy: {}
  }, { id });
}

function needFrame(node, id, capability) {
  const payload = { capability: { name: capability }, input: { test: true }, policy: {} };
  return { frame: node.compactFrame('NEED', payload, { id }), payload };
}

test('G5 same signed NEED cannot execute twice across HTTP/compact, reconnect and post-settlement pruning', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, maxRequests: 1, maxSeenNeedIds: 8 });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await provider.offer('g5.replay');

  const firstId = 'g5-first-completed';
  const first = needEnvelope(requester, firstId, 'g5.replay');
  assert.equal((await post(requester, '/v1/needs', { envelope: first })).status, 200);
  assert.equal((await provider.poll()).events.filter((e) => e.kind === 'NEED').length, 1);
  await provider.result(firstId, { answer: 1 });
  assert.equal((await requester.poll()).events.filter((e) => e.kind === 'RESULT').length, 1);

  // A second distinct request prunes completed detailed state because maxRequests=1.
  const secondId = 'g5-second-compact';
  assert.equal((await post(requester, '/v1/fast/needs?waitMs=0', needFrame(requester, secondId, 'g5.replay'))).status, 200);
  assert.equal(relay.state.requests.has(firstId), false, 'terminal request details were pruned');
  assert.equal((await provider.pollCompact({ waitMs: 0 })).events.filter((e) => e.kind === 'NEED').length, 1);
  await provider.compactResult(secondId, { answer: 2 });
  assert.equal((await requester.pollCompact({ waitMs: 0 })).events.filter((e) => e.kind === 'RESULT').length, 1);

  // A new signed legacy envelope with the same ID must not overwrite old terminal work.
  await requester.register();
  assert.deepEqual(
    (await post(requester, '/v1/needs', { envelope: first })),
    { status: 409, body: { ok: false, error: 'duplicate_request' } }
  );
  assert.equal((await post(requester, '/v1/fast/needs?waitMs=0', needFrame(requester, firstId, 'g5.replay'))).status, 409);
  assert.equal((await post(requester, '/v1/needs', { envelope: needEnvelope(requester, secondId, 'g5.replay') })).status, 409);
  assert.equal((await provider.poll()).events.length, 0, 'legacy provider must not execute replay');
  assert.equal((await provider.pollCompact({ waitMs: 0 })).events.length, 0, 'compact provider must not execute replay');
  assert.equal(relay.state.stats.get(provider.identity.nodeId).successfulTasks, 2);
});

test('G5 replay ledger capacity fails closed rather than silently forgetting settled ids', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, maxRequests: 2, maxSeenNeedIds: 1 });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await provider.offer('g5.capacity');
  assert.equal((await post(requester, '/v1/needs', { envelope: needEnvelope(requester, 'g5-cap-1', 'g5.capacity') })).status, 200);
  assert.equal((await provider.poll()).events.length, 1);
  await provider.result('g5-cap-1', { ok: true });
  assert.equal((await requester.poll()).events.length, 1);
  const denied = await post(requester, '/v1/fast/needs?waitMs=0', needFrame(requester, 'g5-cap-2', 'g5.capacity'));
  assert.equal(denied.status, 503);
  assert.equal(denied.body.error, 'need_idempotency_capacity_reached');
  assert.equal((await provider.pollCompact({ waitMs: 0 })).events.length, 0);
  assert.equal((await post(requester, '/v1/needs', { envelope: needEnvelope(requester, 'g5-cap-1', 'g5.capacity') })).status, 409);
  assert.equal(relay.state.stats.get(provider.identity.nodeId).successfulTasks, 1);
});

test('G5 cancelled request stays terminal against late PARTIAL/RESULT and both NEED transports', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await provider.offer('g5.cancel');
  const requestId = 'g5-terminal-cancel';
  assert.equal((await post(requester, '/v1/fast/needs?waitMs=0', needFrame(requester, requestId, 'g5.cancel'))).status, 200);
  const revoked = await requester.revoke(requestId, 'cancel', { targetKind: 'need' });
  assert.equal(revoked.cancelled, true);
  const partialPayload = { sequence: 0, delta: 'too-late', metadata: {} };
  const partial = await post(provider, '/v1/fast/partials', {
    frame: provider.compactFrame('PARTIAL', partialPayload, { id: requestId }), payload: partialPayload
  });
  assert.equal(partial.status, 409);
  assert.equal(partial.body.error, 'request_cancelled');
  await assert.rejects(() => provider.compactResult(requestId, { late: true }), (e) => e.status === 409 && e.body?.error === 'request_cancelled');
  assert.equal((await post(requester, '/v1/fast/needs?waitMs=0', needFrame(requester, requestId, 'g5.cancel'))).status, 409);
  assert.equal((await post(requester, '/v1/needs', { envelope: needEnvelope(requester, requestId, 'g5.cancel') })).status, 409);
  assert.equal(relay.state.requests.get(requestId)?.status, 'cancelled');
});

test('G5 revoked OFFER cannot be resurrected by identical or conflicting signed replay', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  const offerId = 'g5-revoked-offer-id';
  const original = provider.envelope('OFFER', {
    capability: { name: 'g5.offer.resurrect' }, metadata: {}
  }, { id: offerId });
  assert.equal((await post(provider, '/v1/offers', { envelope: original })).status, 200);
  assert.equal((await requester.find('g5.offer.resurrect')).offers.length, 1);
  await provider.revoke(offerId, 'retired', { targetKind: 'offer' });
  assert.equal((await requester.find('g5.offer.resurrect')).offers.length, 0);
  const retry = await post(provider, '/v1/offers', { envelope: original });
  assert.equal(retry.status, 409);
  assert.equal(retry.body.error, 'duplicate_offer');
  const conflicting = provider.envelope('OFFER', {
    capability: { name: 'g5.offer.resurrect' }, metadata: { anotherVersion: true }
  }, { id: offerId });
  assert.equal((await post(provider, '/v1/offers', { envelope: conflicting })).status, 409);
  assert.equal((await requester.find('g5.offer.resurrect')).offers.length, 0);
  assert.equal(relay.state.offers.get(offerId)?.revoked, true);
});

test('G5 OFFER withdrawal does not retroactively cancel accepted NEED and completed NEED refuses REVOKE', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  const offer = await provider.offer('g5.already.accepted');
  const submitted = await requester.need('g5.already.accepted', { task: 'before revoke' });
  assert.equal((await provider.poll()).events.filter((e) => e.kind === 'NEED').length, 1);
  await provider.revoke(offer.offerId, 'decommissioned');
  assert.equal((await requester.find('g5.already.accepted')).offers.length, 0);
  await provider.result(submitted.needId, { answer: 'accepted-before-revoke' });
  assert.equal((await requester.poll()).events.filter((e) => e.kind === 'RESULT').length, 1);
  assert.equal(relay.state.requests.get(submitted.needId).status, 'completed');
  await assert.rejects(() => requester.revoke(submitted.needId, 'too_late', { targetKind: 'need' }),
    (e) => e.status === 409 && e.body?.error === 'request_already_completed');
  await assert.rejects(() => provider.result(submitted.needId, { answer: 'repeat' }),
    (e) => e.status === 409 && e.body?.error === 'request_already_completed');
  assert.equal(relay.state.stats.get(provider.identity.nodeId).successfulTasks, 1);
});

test('G5 implicit REVOKE namespace stays ambiguous after terminal NEED detail pruning', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, maxRequests: 1 });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await requester.offer('g5.dummy.collision', {});
  await provider.offer('g5.needed');
  const id = 'g5-ambiguous-id';
  const collidingOffer = requester.envelope('OFFER', {
    capability: { name: 'g5.dummy.collision' }, metadata: {}
  }, { id });
  assert.equal((await post(requester, '/v1/offers', { envelope: collidingOffer })).status, 200);
  assert.equal((await post(requester, '/v1/needs', { envelope: needEnvelope(requester, id, 'g5.needed') })).status, 200);
  await provider.poll();
  await provider.result(id, { ok: true });
  await requester.poll();
  const nextId = 'g5-ambiguous-next';
  assert.equal((await post(requester, '/v1/fast/needs?waitMs=0', needFrame(requester, nextId, 'g5.needed'))).status, 200);
  assert.equal(relay.state.requests.has(id), false);
  const implicit = requester.envelope('REVOKE', { targetId: id, reason: 'legacy-auto' });
  const denied = await post(requester, '/v1/revoke', { envelope: implicit });
  assert.equal(denied.status, 409);
  assert.equal(denied.body.error, 'ambiguous_revoke_target');
  assert.equal(relay.state.offers.get(id).revoked, false);
});
