import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteLifecycleLedger } from '../network/relay/durable-lifecycle-ledger.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'truyn-g5-partial-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, 'g5.sqlite');
  return { filePath, open: () => createSqliteLifecycleLedger({ filePath, maxRecords: 20 }) };
}
async function post(node, route, body) {
  const r = await fetch(node.relayUrl + route, {
    method: 'POST', headers: { 'content-type': 'application/json', ...node.authHeaders() },
    body: JSON.stringify(body)
  });
  return { status: r.status, body: await r.json() };
}
test('G5 signed PARTIAL zero-based durable outbox, restart, ACK and terminal order', async t => {
  const { open } = fixture(t);
  const db = open();
  t.after(() => db.close());
  const relay = createRelay({ localDevelopmentMode: true, lifecycleLedger: db });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  const attacker = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await attacker.register();
  await provider.offer('g5.partial.durable');
  const id = 'g5-partial-crash-safe';
  const payload = { capability: { name: 'g5.partial.durable' }, input: { number: 1 }, policy: {} };
  const frame = requester.compactFrame('NEED', payload, { id });
  assert.equal((await post(requester, '/v1/fast/needs?waitMs=0', { frame, payload })).status, 200);
  for (let sequence = 0; sequence < 2; sequence++) {
    const chunk = { sequence, delta: 'signed-chunk-' + sequence, metadata: {} };
    const signed = provider.compactFrame('PARTIAL', chunk, { id });
    assert.equal((await post(provider, '/v1/fast/partials', { frame: signed, payload: chunk })).status, 200);
  }
  const original = await requester.recoverDurable();
  assert.deepEqual(original.deliveries.map(x => x.eventId), ['partial:' + id + ':0', 'partial:' + id + ':1']);
  assert(original.deliveries.every(x => x.verification.ok));
  assert.equal((await attacker.recoverDurable()).deliveries.length, 0);
  assert.equal((await post(attacker, '/v1/lifecycle/deliveries/ack', { eventId: 'partial:' + id + ':0' })).status, 404);
  const zero = original.deliveries[0];
  assert.equal((await requester.acknowledgeDurable(zero.eventId)).idempotent, false);
  assert.equal((await requester.acknowledgeDurable(zero.eventId)).idempotent, true);
  const result = await provider.compactResult(id, { value: 9 });
  assert.equal(result.ok, true);
  assert.deepEqual((await requester.recoverDurable()).deliveries.map(x => x.eventId), ['partial:' + id + ':1', 'result:' + id]);
  await relay.close();
  const db2 = open();
  t.after(() => db2.close());
  const second = createRelay({ localDevelopmentMode: true, lifecycleLedger: db2 });
  t.after(() => second.close());
  const secondUrl = await second.listen({ port: 0 });
  const requester2 = new TruynNode({ relayUrl: secondUrl, identity: requester.identity });
  const provider2 = new TruynNode({ relayUrl: secondUrl, identity: provider.identity });
  await requester2.register();
  await provider2.register();
  assert.deepEqual((await requester2.recoverDurable()).deliveries.map(x => x.eventId), ['partial:' + id + ':1', 'result:' + id]);
  assert.equal((await requester2.acknowledgeDurable('partial:' + id + ':1')).acknowledged, true);
  assert.equal((await requester2.acknowledgeDurable('result:' + id)).acknowledged, true);
  assert.equal((await requester2.recoverDurable()).deliveries.length, 0);
  const late = { sequence: 2, delta: 'late', metadata: {} };
  assert.equal((await post(provider2, '/v1/fast/partials', { frame: provider2.compactFrame('PARTIAL', late, { id }), payload: late })).status, 409);
});
test('G5 existing v1 SQLite outbox migrates without losing NEED and ACK records', t => {
  const { filePath, open } = fixture(t);
  const old = new DatabaseSync(filePath);
  old.exec(`CREATE TABLE lifecycle_needs (id TEXT PRIMARY KEY,requester TEXT,provider TEXT,fingerprint TEXT,capability TEXT,mode TEXT,status TEXT,created_at TEXT,terminal_at TEXT,partial_sequence INTEGER DEFAULT 0,partial_digest TEXT);
CREATE TABLE lifecycle_outbox (event_id TEXT PRIMARY KEY,request_id TEXT,recipient TEXT,kind TEXT CHECK(kind IN ('NEED','RESULT','REVOKE')),event_json TEXT,created_at TEXT,acknowledged_at TEXT);
INSERT INTO lifecycle_needs (id,requester,provider,fingerprint,capability,mode,status,created_at) VALUES ('prior','alice','bob','h','x','fast','matched','2026-10-11T01:00:00Z');
INSERT INTO lifecycle_outbox (event_id,request_id,recipient,kind,event_json,created_at,acknowledged_at) VALUES ('need:prior','prior','bob','NEED','{"kind":"NEED"}','2026-10-11T01:00:00Z',NULL);`);
  old.close();
  const ledger = open(); t.after(() => ledger.close());
  assert.equal(ledger.pendingDeliveries({ recipient: 'bob' }).length, 1);
  ledger.acceptPartial({
    id: 'prior', provider: 'bob', sequence: 0, digest: 'unique',
    delivery: { recipient: 'alice', kind: 'PARTIAL', event: { kind: 'PARTIAL', requestId: 'prior', sequence: 0 } }
  });
  assert.equal(ledger.pendingDeliveries({ recipient: 'alice' })[0].eventId, 'partial:prior:0');
  assert.equal(ledger.acknowledgeDelivery({ eventId: 'need:prior', recipient: 'bob' }).acknowledged, true);
  assert.equal(ledger.pendingDeliveries({ recipient: 'bob' }).length, 0);
});
test('G5 failed PARTIAL outbox admission leaves original sequence and tombstone intact', t => {
  const { open } = fixture(t);
  const ledger = open(); t.after(() => ledger.close());
  ledger.reserveNeed({ id: 'g5-durable-capacity', requester: 'a', provider: 'b', fingerprint: 'h', capability: 'x', mode: 'fast' });
  assert.throws(() => ledger.acceptPartial({
    id: 'g5-durable-capacity', provider: 'b', sequence: 0, digest: 'd0',
    delivery: { recipient: 'other-user', kind: 'PARTIAL', event: { kind: 'PARTIAL', requestId: 'g5-durable-capacity', sequence: 0 } }
  }), e => e.httpStatus === 400);
  assert.equal(ledger.getNeed('g5-durable-capacity').partial_sequence, 0);
  assert.equal(ledger.pendingDeliveries({ recipient: 'a' }).length, 0);
});
