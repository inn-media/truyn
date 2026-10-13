import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteLifecycleLedger } from '../network/relay/durable-lifecycle-ledger.js';
import { createIdentity } from '../core/identity/index.js';
import { createEnvelope, verifyEnvelope } from '../core/protocol/index.js';
import { assertNeedAdmissionWindow } from '../core/protocol/need-admission.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

test('G5 signed NEED window is inclusive [-300000,+30000] ms without invalidating old signatures', () => {
  const identity = createIdentity(), now = Date.now();
  for (const [offset, accept] of [[-300001, false], [-300000, true], [0, true], [30000, true], [30001, false]]) {
    const envelope = createEnvelope({ type: 'NEED', from: identity.nodeId,
      payload: { capability: { name: 'window' } }, createdAt: new Date(now + offset).toISOString(),
      privateKeyPem: identity.privateKeyPem, publicKeyPem: identity.publicKeyPem });
    assert.equal(verifyEnvelope(envelope).ok, true);
    if (accept) assert.doesNotThrow(() => assertNeedAdmissionWindow(envelope, now));
    else assert.throws(() => assertNeedAdmissionWindow(envelope, now), /need_outside_acceptance_window/);
  }
});

test('G5 HTTP rejects old/future signed NEED before reservation, then admits a freshly signed same ID', async t => {
  const relay = createRelay({ localDevelopmentMode: true, maxSeenNeedIds: 1 });
  const relayUrl = await relay.listen({ port: 0 }); t.after(() => relay.close());
  const p = new TruynNode({ relayUrl }), r = new TruynNode({ relayUrl });
  await p.register(); await r.register(); await p.offer('window');
  const post = async createdAt => {
    const envelope = createEnvelope({ type: 'NEED', id: 'not-yet-consumed', from: r.identity.nodeId,
      createdAt, payload: { capability: { name: 'window' } },
      privateKeyPem: r.identity.privateKeyPem, publicKeyPem: r.identity.publicKeyPem });
    const response = await fetch(relayUrl + '/v1/needs', { method: 'POST',
      headers: { 'content-type': 'application/json', ...r.authHeaders() }, body: JSON.stringify({ envelope }) });
    return { status: response.status, body: await response.json() };
  };
  for (const offset of [-600000, 600000]) {
    const result = await post(new Date(Date.now() + offset).toISOString());
    assert.equal(result.status, 400); assert.equal(result.body.error, 'need_outside_acceptance_window');
  }
  assert.equal((await p.poll()).events.length, 0);
  assert.equal((await post(new Date().toISOString())).status, 200);
  assert.equal((await p.poll()).events.length, 1);
  assert.equal((await post(new Date(Date.now() - 600000).toISOString())).status, 409, 'an admitted ID is never recyclable');
});

test('G5 in-memory HTTP and compact concurrent admissions cannot both pass the replay check', async t => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 }); t.after(() => relay.close());
  const p = new TruynNode({ relayUrl }), r = new TruynNode({ relayUrl });
  await p.register(); await r.register(); await p.offer('window-race');
  const payload = { capability: { name: 'window-race' }, input: {}, policy: {} }, id = 'same-id-racing';
  const post = (path, body) => fetch(relayUrl + path, { method: 'POST',
    headers: { 'content-type': 'application/json', ...r.authHeaders() }, body: JSON.stringify(body) });
  const responses = await Promise.all([
    post('/v1/needs', { envelope: r.envelope('NEED', payload, { id }) }),
    post('/v1/fast/needs?waitMs=0', { frame: r.compactFrame('NEED', payload, { id }), payload })
  ]);
  assert.deepEqual(responses.map(x => x.status).sort(), [200, 409]);
  assert.equal((await p.poll()).events.length + (await p.pollCompact({ waitMs: 0 })).events.length, 1);
});

test('G5 async durable reservation failure never reports a provisional ID as committed 409', { timeout: 15000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'truyn-g5-pending-'));
  const sqlite = createSqliteLifecycleLedger({ filePath: join(directory, 'ledger.sqlite') });
  t.after(() => { sqlite.close(); rmSync(directory, { recursive: true, force: true }); });
  let enterFirst, release;
  const firstReserved = new Promise(resolve => { enterFirst = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  let arrivals = 0;
  const lifecycleLedger = {
    ...sqlite,
    async reserveNeed() {
      arrivals += 1;
      if (arrivals === 1) enterFirst();
      if (arrivals === 2) release();
      await pending;
      throw Object.assign(new Error('lifecycle_write_unavailable'), {
        httpStatus: 503, publicCode: 'lifecycle_write_unavailable'
      });
    }
  };
  const relay = createRelay({ localDevelopmentMode: true, lifecycleLedger, maxSeenNeedIds: 1 });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const provider = new TruynNode({ relayUrl }), requester = new TruynNode({ relayUrl });
  await provider.register(); await requester.register(); await provider.offer('g5.pending');
  const payload = { capability: { name: 'g5.pending' }, input: {}, policy: {} };
  const id = 'g5-pending-failed-id';
  const post = async (path, body) => {
    const response = await fetch(relayUrl + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...requester.authHeaders() },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };
  const first = post('/v1/needs', { envelope: requester.envelope('NEED', payload, { id }) });
  await firstReserved;
  // Without the fix, the second request receives a false duplicate while the
  // first ledger reservation is still pending and eventually fails.
  const deadline = setTimeout(() => release(), 1500);
  const second = post('/v1/fast/needs?waitMs=0', {
    frame: requester.compactFrame('NEED', payload, { id }), payload
  });
  const responses = await Promise.all([first, second]);
  clearTimeout(deadline);
  assert.equal(arrivals, 2, 'both requests must consult shared durable admission');
  assert.deepEqual(responses.map(r => r.status), [503, 503]);
  assert.deepEqual(responses.map(r => r.body.error), ['lifecycle_write_unavailable', 'lifecycle_write_unavailable']);
  assert.equal((await provider.poll()).events.length, 0, 'no dispatch after precommit storage failure');
  assert.equal((await provider.pollCompact({ waitMs: 0 })).events.length, 0);
  assert.equal((await sqlite.getNeed(id)), null, 'failed reservation never created a durable tombstone');
});
