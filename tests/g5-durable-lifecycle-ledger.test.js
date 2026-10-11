import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createSqliteLifecycleLedger } from '../network/relay/durable-lifecycle-ledger.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { TruynAdapterHost, createFunctionAdapter } from '../adapters/sdk/index.js';

function fixture(t, maxRecords = 8) {
  const dir = mkdtempSync(path.join(tmpdir(), 'truyn-g5-'));
  const filePath = path.join(dir, 'lifecycle.sqlite');
  const open = () => createSqliteLifecycleLedger({ filePath, maxRecords });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { filePath, open };
}
async function post(node, route, data) {
  const response = await fetch(node.relayUrl + route, {
    method: 'POST', headers: { 'content-type': 'application/json', ...node.authHeaders() },
    body: JSON.stringify(data)
  });
  return { status: response.status, body: await response.json() };
}
function makeNeed(node, id, capability) {
  return node.envelope('NEED', { capability: { name: capability }, input: { id }, policy: {} }, { id });
}
function makeCompactNeed(node, id, capability) {
  const payload = { capability: { name: capability }, input: { id }, policy: {} };
  return { frame: node.compactFrame('NEED', payload, { id }), payload };
}

test('G5 SQLite CAS: competing processes share single-use ID and irreversible terminal across reopen', (t) => {
  const { open } = fixture(t, 2);
  const a = open(), b = open();
  t.after(() => { a.close(); b.close(); });
  const candidate = { id: 'atomic-1', requester: 'alice', provider: 'bob', fingerprint: 'signed-a', capability: 'x', mode: 'legacy' };
  a.reserveNeed(candidate);
  assert.throws(() => b.reserveNeed({ ...candidate, requester: 'mallory', fingerprint: 'forged' }), (e) => e.httpStatus === 409 && e.publicCode === 'duplicate_request');
  assert.equal(b.getNeed('atomic-1').requester, 'alice');
  assert.throws(() => b.transitionNeed({ id: 'atomic-1', requester: 'mallory', to: 'cancelled' }), (e) => e.httpStatus === 403);
  a.transitionNeed({ id: 'atomic-1', provider: 'bob', to: 'completed' });
  assert.throws(() => b.transitionNeed({ id: 'atomic-1', requester: 'alice', to: 'cancelled' }), (e) => e.httpStatus === 409);
  assert.equal(b.getNeed('atomic-1').status, 'completed');
  b.reserveNeed({ ...candidate, id: 'atomic-2' });
  assert.throws(() => a.reserveNeed({ ...candidate, id: 'atomic-3' }), (e) => e.httpStatus === 503 && e.publicCode === 'need_idempotency_capacity_reached');
  a.reserveOffer({ id: 'cap-offer-1', owner: 'bob', fingerprint: 'f1' });
  b.reserveOffer({ id: 'cap-offer-2', owner: 'bob', fingerprint: 'f2' });
  assert.throws(() => a.reserveOffer({ id: 'cap-offer-3', owner: 'bob', fingerprint: 'f3' }), (e) => e.httpStatus === 503 && e.publicCode === 'offer_idempotency_capacity_reached');
  a.beginEffect({ id: 'cap-effect-1', provider: 'bob', requester: 'alice', fingerprint: 'f1' });
  b.beginEffect({ id: 'cap-effect-2', provider: 'bob', requester: 'alice', fingerprint: 'f2' });
  assert.throws(() => a.beginEffect({ id: 'cap-effect-3', provider: 'bob', requester: 'alice', fingerprint: 'f3' }), (e) => e.httpStatus === 503 && e.publicCode === 'effect_idempotency_capacity_reached');
});

test('G5 durable OFFER withdrawal and PARTIAL terminal CAS across independent connections', (t) => {
  const { open } = fixture(t); const a = open(), b = open();
  t.after(() => { a.close(); b.close(); });
  a.reserveOffer({ id: 'offer-fixed', owner: 'bob', fingerprint: 'fingerprint-a' });
  b.revokeOffer({ id: 'offer-fixed', owner: 'bob' });
  assert.equal(a.getOffer('offer-fixed').revoked, 1);
  assert.throws(() => a.reserveOffer({ id: 'offer-fixed', owner: 'bob', fingerprint: 'changed' }), (e) => e.httpStatus === 409);
  a.reserveNeed({ id: 'partial-1', requester: 'alice', provider: 'bob', fingerprint: 'signed', capability: 'x', mode: 'fast' });
  assert.deepEqual(a.acceptPartial({ id: 'partial-1', provider: 'bob', sequence: 0, digest: 'd0' }), { idempotent: false, previousDigest: null });
  assert.deepEqual(b.acceptPartial({ id: 'partial-1', provider: 'bob', sequence: 0, digest: 'd0' }), { idempotent: true });
  assert.throws(() => b.acceptPartial({ id: 'partial-1', provider: 'bob', sequence: 0, digest: 'evil' }), (e) => e.httpStatus === 409);
  assert.throws(() => b.acceptPartial({ id: 'partial-1', provider: 'bob', sequence: 2, digest: 'd2' }), (e) => e.httpStatus === 409);
  const second = b.acceptPartial({ id: 'partial-1', provider: 'bob', sequence: 1, digest: 'd1' });
  assert.equal(second.previousDigest, 'd0');
  assert.equal(b.rollbackPartial({ id: 'partial-1', sequence: 1, digest: 'd1', previousDigest: second.previousDigest }), true);
  assert.deepEqual(a.acceptPartial({ id: 'partial-1', provider: 'bob', sequence: 0, digest: 'd0' }), { idempotent: true });
  a.transitionNeed({ id: 'partial-1', requester: 'alice', to: 'cancelled' });
  assert.throws(() => b.acceptPartial({ id: 'partial-1', provider: 'bob', sequence: 1, digest: 'd1' }), (e) => e.httpStatus === 409 && e.publicCode === 'request_cancelled');
  assert.throws(() => b.transitionNeed({ id: 'partial-1', provider: 'bob', to: 'completed' }), (e) => e.httpStatus === 409);
});

test('G5 relay restart, multiple relays and transport switch never dispatch one direct NEED ID twice', async (t) => {
  const { open } = fixture(t);
  const ledgers = [open(), open()];
  t.after(() => ledgers.forEach(x => x.close()));
  const relays = ledgers.map(lifecycleLedger => createRelay({ localDevelopmentMode: true, lifecycleLedger }));
  for (const relay of relays) t.after(() => relay.close());
  const [urlA, urlB] = await Promise.all(relays.map(r => r.listen({ port: 0 })));
  const providerA = new TruynNode({ relayUrl: urlA });
  const requesterA = new TruynNode({ relayUrl: urlA });
  await providerA.register(); await requesterA.register();
  await providerA.offer('g5.persist');
  const providerB = new TruynNode({ relayUrl: urlB, identity: providerA.identity });
  const requesterB = new TruynNode({ relayUrl: urlB, identity: requesterA.identity });
  await providerB.register(); await requesterB.register();
  await providerB.offer('g5.persist');
  const requestId = 'g5-restart-and-replica';
  const signed = makeNeed(requesterA, requestId, 'g5.persist');
  const first = await Promise.all([
    post(requesterA, '/v1/needs', { envelope: signed }),
    post(requesterB, '/v1/fast/needs?waitMs=0', makeCompactNeed(requesterB, requestId, 'g5.persist'))
  ]);
  assert.deepEqual(first.map(x=>x.status).sort(), [200,409]);
  const total = (await providerA.poll()).events.length + (await providerB.pollCompact({ waitMs: 0 })).events.length;
  assert.equal(total, 1, 'a single side effect can be scheduled');
  const accepted = ledgers[0].getNeed(requestId);
  assert.equal(accepted.requester, requesterA.identity.nodeId);
  assert.equal(ledgers[1].getNeed(requestId).provider, providerA.identity.nodeId);
  if (first[0].status === 200) await providerA.result(requestId, { ok: 1 });
  else await providerB.compactResult(requestId, { ok: 1 });
  assert.equal(ledgers[1].getNeed(requestId).status, 'completed');
  const more = await post(requesterB, '/v1/needs', { envelope: signed });
  assert.equal(more.status, 409);
  await Promise.all(relays.map(r => r.close()));
  const restarted = createRelay({ localDevelopmentMode: true, lifecycleLedger: ledgers[0] });
  t.after(() => restarted.close());
  const urlC = await restarted.listen({ port: 0 });
  const requesterC = new TruynNode({ relayUrl: urlC, identity: requesterA.identity });
  const providerC = new TruynNode({ relayUrl: urlC, identity: providerA.identity });
  await requesterC.register(); await providerC.register();
  await providerC.offer('g5.persist');
  const retry = await post(requesterC, '/v1/fast/needs?waitMs=0', makeCompactNeed(requesterC, requestId, 'g5.persist'));
  assert.equal(retry.status, 409);
  const response = await fetch(urlC + '/v1/requests/' + requestId, { headers: requesterC.authHeaders() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'completed');
  assert.equal((await providerC.poll()).events.length, 0);
});

test('G5 provider effect intent survives SIGKILL and rejects blind side-effect redo', (t) => {
  const { filePath, open } = fixture(t);
  const script = [
    "import { createSqliteLifecycleLedger } from './network/relay/durable-lifecycle-ledger.js';",
    "const ledger=createSqliteLifecycleLedger({filePath:process.argv[1]});",
    "const intent=ledger.beginEffect({id:'paid-opaque-1',provider:'provider',requester:'alice',fingerprint:'request-v1'});",
    "if(!intent.acquired) process.exit(7);",
    "process.kill(process.pid, 'SIGKILL');"
  ].join('\n');
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, filePath], { cwd: process.cwd() });
  assert.equal(child.signal, 'SIGKILL');
  const ledger = open(); t.after(() => ledger.close());
  assert.equal(ledger.getEffect('paid-opaque-1').status, 'started');
  assert.throws(
    () => ledger.beginEffect({ id: 'paid-opaque-1', provider: 'provider', requester: 'alice', fingerprint: 'changed' }),
    (error) => error.httpStatus === 409 && error.publicCode === 'effect_identity_conflict'
  );
  assert.throws(
    () => ledger.beginEffect({ id: 'paid-opaque-1', provider: 'evil-provider', requester: 'alice', fingerprint: 'request-v1' }),
    (error) => error.httpStatus === 409 && error.publicCode === 'effect_identity_conflict'
  );
  assert.throws(
    () => ledger.beginEffect({ id: 'paid-opaque-1', provider: 'provider', requester: 'mallory', fingerprint: 'request-v1' }),
    (error) => error.httpStatus === 409 && error.publicCode === 'effect_identity_conflict'
  );
  assert.equal(ledger.beginEffect({ id: 'paid-opaque-1', provider: 'provider', requester: 'alice', fingerprint: 'request-v1' }).acquired, false);
  const marked = ledger.finishEffect({ id: 'paid-opaque-1', provider: 'provider', outcome: 'unknown' });
  assert.equal(marked.row.status, 'unknown');
  assert.equal(ledger.beginEffect({ id: 'paid-opaque-1', provider: 'provider', requester: 'alice', fingerprint: 'request-v1' }).acquired, false);
});


test('G5 effect collision remains fail-closed for both SQLite handles, cross-process races and restart', (t) => {
  const { open } = fixture(t);
  const a = open(), b = open();
  t.after(() => { a.close(); b.close(); });
  const original = { id: 'collision-v1', provider: 'provider-a', requester: 'alice', fingerprint: 'signed-need-v1' };
  assert.equal(a.beginEffect(original).acquired, true);
  const mutations = [
    { ...original, provider: 'provider-b' },
    { ...original, requester: 'mallory' },
    { ...original, fingerprint: 'signed-need-v2' }
  ];
  for (const other of mutations) {
    assert.throws(() => b.beginEffect(other), (e) => e.httpStatus === 409 && e.publicCode === 'effect_identity_conflict');
    assert.deepEqual(
      { provider: a.getEffect(original.id).provider, requester: a.getEffect(original.id).requester, fingerprint: a.getEffect(original.id).fingerprint },
      { provider: original.provider, requester: original.requester, fingerprint: original.fingerprint }
    );
  }
  assert.equal(b.beginEffect(original).acquired, false);
  assert.equal(b.finishEffect({ id: original.id, provider: 'provider-a', outcome: 'unknown' }).changed, true);
  assert.throws(() => a.beginEffect(mutations[2]), (e) => e.httpStatus === 409);
  assert.equal(a.beginEffect(original).acquired, false, 'ambiguous provider effect never blindly re-executes');
});

test('G5 provider adapter host effect fence blocks duplicate external execution across two worker instances', async (t) => {
  const { open } = fixture(t);
  const a = open(), b = open();
  t.after(() => { a.close(); b.close(); });
  let externalEffects = 0;
  const adapter = createFunctionAdapter({
    name: 'side-effect-exact-once-negative',
    capabilities: ['g5.external'],
    execute: async () => { externalEffects += 1; return { output: { ok: true }, metadata: {} }; }
  });
  const auth = { mode: 'test-only', authorize: () => ({ ok: true }) };
  const makeHost = (ledger) => new TruynAdapterHost({
    node: { identity: { nodeId: 'provider-1' }, result: async () => ({ ok: true }) },
    adapter, accessPolicy: auth, effectLedger: ledger
  });
  const need = { id: 'host-effect-once', from: 'alice', payload: { capability: { name: 'g5.external' }, input: { payload: 1 }, policy: {} } };
  const state = () => ({ controller: new AbortController(), nextSequence: 0 });
  await Promise.all([makeHost(a).executeNeed(need, state()), makeHost(b).executeNeed(need, state())]);
  assert.equal(externalEffects, 1);
  assert.equal(a.getEffect(need.id).status, 'completed');
  await makeHost(b).executeNeed(need, state());
  assert.equal(externalEffects, 1, 'provider restart must not resubmit an ambiguous paid effect');
});


test('G5 peer-ledger REVOKE suppresses stale cached duplicate PARTIAL and exposes authoritative status', async (t) => {
  const { open } = fixture(t); const la = open(), lb = open();
  t.after(() => { la.close(); lb.close(); });
  const relayA = createRelay({ localDevelopmentMode: true, lifecycleLedger: la });
  const relayB = createRelay({ localDevelopmentMode: true, lifecycleLedger: lb });
  t.after(() => relayA.close()); t.after(() => relayB.close());
  const urlA = await relayA.listen({ port: 0 });
  const urlB = await relayB.listen({ port: 0 });
  const providerA = new TruynNode({ relayUrl: urlA });
  const requesterA = new TruynNode({ relayUrl: urlA });
  await providerA.register(); await requesterA.register();
  const requesterB = new TruynNode({ relayUrl: urlB, identity: requesterA.identity });
  await requesterB.register();
  await providerA.offer('g5.peer.cancel');
  const id = 'peer-cancellation-partial';
  assert.equal((await post(requesterA, '/v1/fast/needs?waitMs=0', makeCompactNeed(requesterA, id, 'g5.peer.cancel'))).status, 200);
  const payload = { sequence: 0, delta: 'chunk', metadata: {} };
  const frame = providerA.compactFrame('PARTIAL', payload, { id });
  assert.equal((await post(providerA, '/v1/fast/partials', { frame, payload })).status, 200);
  const cancelled = await requesterB.revoke(id, 'peer-cancel', { targetKind: 'need' });
  assert.equal(cancelled.deliveryPending, true);
  const late = await post(providerA, '/v1/fast/partials', { frame, payload });
  assert.equal(late.status, 409);
  assert.equal(late.body.error, 'request_cancelled');
  const response = await fetch(urlA + '/v1/fast/requests/' + id, { headers: requesterA.authHeaders() });
  assert.equal((await response.json()).status, 'cancelled');
});

test('G5 durable lifecycle status surface enforces requester/provider authority', async (t) => {
  const { open } = fixture(t); const ledger = open();
  t.after(() => ledger.close());
  const relay = createRelay({ localDevelopmentMode: true, lifecycleLedger: ledger });
  t.after(() => relay.close());
  const relayUrl = await relay.listen({ port: 0 });
  const provider = new TruynNode({ relayUrl }), requester = new TruynNode({ relayUrl }), outsider = new TruynNode({ relayUrl });
  await provider.register(); await requester.register(); await outsider.register();
  await provider.offer('g5.status.auth');
  const id = 'g5-status-owner';
  assert.equal((await post(requester, '/v1/needs', { envelope: makeNeed(requester, id, 'g5.status.auth') })).status, 200);
  async function status(node, type) {
    const response = await fetch(relayUrl + '/v1/lifecycle/' + type + '/' + id, { headers: node.authHeaders() });
    return { status: response.status, body: await response.json() };
  }
  assert.equal((await status(requester, 'needs')).body.status, 'matched');
  assert.equal((await status(provider, 'needs')).status, 200);
  assert.equal((await status(outsider, 'needs')).status, 404);
  ledger.beginEffect({ id, provider: provider.identity.nodeId, requester: requester.identity.nodeId, fingerprint: 'opaque-signature-digest' });
  assert.equal((await status(provider, 'effects')).body.reconciliationRequired, true);
  assert.equal((await status(requester, 'effects')).status, 404);
  assert.equal((await status(outsider, 'effects')).status, 404);
});


test('G5 signed OFFER REVOKE remains owner-idempotent after relay restart', async (t) => {
  const { open } = fixture(t); const ledger = open();
  t.after(() => ledger.close());
  const a = createRelay({ localDevelopmentMode: true, lifecycleLedger: ledger });
  const urlA = await a.listen({ port: 0 });
  const ownerA = new TruynNode({ relayUrl: urlA });
  await ownerA.register();
  const offer = await ownerA.offer('g5.offer.durable.idempotency');
  await ownerA.revoke(offer.offerId, 'withdrawn', { targetKind: 'offer' });
  assert.equal(ledger.getOffer(offer.offerId).revoked, 1);
  await a.close();
  const b = createRelay({ localDevelopmentMode: true, lifecycleLedger: ledger });
  t.after(() => b.close());
  const urlB = await b.listen({ port: 0 });
  const ownerB = new TruynNode({ relayUrl: urlB, identity: ownerA.identity });
  await ownerB.register();
  const repeated = await ownerB.revoke(offer.offerId, 'repeat-after-restart', { targetKind: 'offer' });
  assert.equal(repeated.idempotent, true);
  assert.equal(ledger.getOffer(offer.offerId).revoked, 1);
});
