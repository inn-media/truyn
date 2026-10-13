import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, fork } from 'node:child_process';
import { once } from 'node:events';
import { createIdentity } from '../core/identity/index.js';
import { createEnvelope } from '../core/protocol/index.js';
import { TruynQuicTransport } from '../network/transport/quic.js';
import { TruynNetworkNode } from '../network/runtime.js';
import { createSqliteLifecycleLedger } from '../network/relay/durable-lifecycle-ledger.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { maintenanceStore } from './fixtures/g5-maintenance-cosmos.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'truyn-g5-quic-'));
  const key = join(root, 'key.pem'), cert = join(root, 'cert.pem');
  const generated = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', key, '-out', cert, '-subj', '/CN=127.0.0.1', '-days', '1',
    '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  assert.equal(generated.status, 0, generated.stderr);
  const tls = { key: readFileSync(key, 'utf8'), cert: readFileSync(cert, 'utf8') };
  const transports = [], ledgers = [];
  t.after(async () => {
    await Promise.allSettled(transports.filter(x => x.server).map(x => x.close()));
    for (const ledger of ledgers) ledger.close();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root, tls,
    ledger() { const ledger = createSqliteLifecycleLedger({ filePath: join(root, 'needs.sqlite') }); ledgers.push(ledger); return ledger; },
    async transport(options = {}, handler = () => ({ accepted: true })) {
      const transport = new TruynQuicTransport({ identity: createIdentity(), host: '127.0.0.1', tls, ...options });
      transport.onEnvelope(handler); transports.push(transport); await transport.start(); return transport;
    }
  };
}
const connect = (client, server) => client.connect({ host: '127.0.0.1', port: server.port });
function need(client, server, id, extra = {}) {
  return createEnvelope({ type: 'NEED', id, from: client.identity.nodeId, to: server.identity.nodeId,
    payload: { capability: { name: 'g5.quic' }, input: { test: true }, policy: {} },
    privateKeyPem: client.identity.privateKeyPem, publicKeyPem: client.identity.publicKeyPem, ...extra });
}
const duplicate = error => error.code === 'duplicate_request';

test('G5 actual QUIC rejects concurrent, reconnected, conflicting and foreign same-ID NEEDs', { timeout: 20000 }, async t => {
  const f = fixture(t); let effects = 0;
  const server = await f.transport({}, async () => { effects++; return { effect: effects }; });
  const client = await f.transport(), other = await f.transport();
  let session = await connect(client, server);
  const envelope = need(client, server, 'quic-single-use');
  const race = await Promise.allSettled([client.sendEnvelope(session, envelope), client.sendEnvelope(session, envelope)]);
  assert.equal(race.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(race.find(x => x.status === 'rejected').reason.code, 'duplicate_request');
  await client.disconnect(session); session = await connect(client, server);
  await assert.rejects(client.sendEnvelope(session, envelope), duplicate);
  await assert.rejects(client.sendEnvelope(session, need(client, server, envelope.id, {
    payload: { capability: { name: 'g5.quic' }, input: { changed: true } }
  })), duplicate);
  await assert.rejects(other.sendEnvelope(await connect(other, server), need(other, server, envelope.id)), duplicate);
  assert.equal(effects, 1);
});

test('G5 QUIC reservation survives an ambiguous handler failure and capacity fails closed', { timeout: 20000 }, async t => {
  const f = fixture(t); let effects = 0;
  const server = await f.transport({ maxSeenNeedIds: 1 }, () => { effects++; throw Error('effect_reply_lost'); });
  const client = await f.transport(), session = await connect(client, server);
  const envelope = need(client, server, 'quic-unknown-effect');
  await assert.rejects(client.sendEnvelope(session, envelope), /effect_reply_lost/);
  await assert.rejects(client.sendEnvelope(session, envelope), duplicate);
  await assert.rejects(client.sendEnvelope(session, need(client, server, 'quic-over-capacity')),
    e => e.code === 'need_idempotency_capacity_reached');
  assert.equal(effects, 1);
});

test('G5 QUIC stale/future/wrong-recipient NEED never invokes handler or consumes ID capacity', { timeout: 20000 }, async t => {
  const f = fixture(t); let effects = 0;
  const server = await f.transport({ maxSeenNeedIds: 1 }, () => ++effects);
  const client = await f.transport(), session = await connect(client, server);
  for (const offset of [-600000, 600000]) {
    await assert.rejects(client.sendEnvelope(session, need(client, server, 'window-id', { createdAt: new Date(Date.now() + offset).toISOString() })),
      e => e.code === 'need_outside_acceptance_window');
  }
  await assert.rejects(client.sendEnvelope(session, need(client, server, 'window-id', { to: createIdentity().nodeId })),
    e => e.code === 'need_recipient_mismatch');
  assert.equal(effects, 0);
  assert.equal(await client.sendEnvelope(session, need(client, server, 'window-id')), 1);
});

test('G5 QUIC shared SQLite admits once across replicas, restart, HTTP and compact', { timeout: 25000 }, async t => {
  const f = fixture(t), identity = createIdentity(); let effects = 0;
  const a = await f.transport({ identity, lifecycleLedger: f.ledger() }, () => ++effects);
  const b = await f.transport({ identity, lifecycleLedger: f.ledger() }, () => ++effects);
  const client = await f.transport();
  const envelope = need(client, a, 'quic-durable-one');
  const race = await Promise.allSettled([
    client.sendEnvelope(await connect(client, a), envelope),
    client.sendEnvelope(await connect(client, b), envelope)
  ]);
  assert.equal(race.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(race.find(x => x.status === 'rejected').reason.code, 'duplicate_request');
  assert.equal(effects, 1);
  await a.close(); await b.close();
  const restarted = await f.transport({ identity, lifecycleLedger: f.ledger() }, () => ++effects);
  const session = await connect(client, restarted);
  await assert.rejects(client.sendEnvelope(session, envelope), duplicate);
  const relay = createRelay({ localDevelopmentMode: true, lifecycleLedger: f.ledger() });
  const relayUrl = await relay.listen({ port: 0 }); t.after(() => relay.close());
  const requester = new TruynNode({ relayUrl, identity: client.identity });
  const provider = new TruynNode({ relayUrl, identity });
  await requester.register(); await provider.register(); await provider.offer('g5.quic');
  const post = async (path, body) => fetch(relayUrl + path, { method: 'POST',
    headers: { 'content-type': 'application/json', ...requester.authHeaders() }, body: JSON.stringify(body) });
  assert.equal((await post('/v1/needs', { envelope })).status, 409);
  const payload = envelope.payload;
  assert.equal((await post('/v1/fast/needs?waitMs=0', { frame: requester.compactFrame('NEED', payload, { id: envelope.id }), payload })).status, 409);
  const http = need(client, restarted, 'http-first');
  assert.equal((await post('/v1/needs', { envelope: http })).status, 200);
  assert.equal((await provider.poll()).events.length, 1);
  await assert.rejects(client.sendEnvelope(session, http), duplicate);
  await provider.result(http.id, { ok: true });
  await assert.rejects(client.sendEnvelope(session, http), duplicate);
  assert.equal(effects, 1);
});

test('G5 QUIC awaits asynchronous Cosmos CAS and rejects store outage before handler', { timeout: 20000 }, async t => {
  const f = fixture(t), store = maintenanceStore(), identity = createIdentity(); let effects = 0;
  const a = await f.transport({ identity, lifecycleLedger: store.ledger() }, () => ++effects);
  const b = await f.transport({ identity, lifecycleLedger: store.ledger() }, () => ++effects);
  const client = await f.transport(), ca = await connect(client, a), cb = await connect(client, b);
  const envelope = need(client, a, 'quic-cosmos');
  const race = await Promise.allSettled([client.sendEnvelope(ca, envelope), client.sendEnvelope(cb, envelope)]);
  assert.equal(race.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(race.find(x => x.status === 'rejected').reason.code, 'duplicate_request');
  store.online = false;
  await assert.rejects(client.sendEnvelope(cb, need(client, b, 'during-partition')), /lifecycle_/);
  assert.equal(effects, 1);
  store.online = true;
  await assert.rejects(client.sendEnvelope(ca, envelope), duplicate);
  assert.equal(await client.sendEnvelope(cb, need(client, b, 'after-heal')), 2);
});

test('G5 runtime cannot combine durable no-redispatch with legacy at-least-once recovery', t => {
  const f = fixture(t);
  assert.throws(() => new TruynNetworkNode({ tls: f.tls, lifecycleLedger: f.ledger(), workInboxPath: join(f.root, 'work.json') }),
    /durable_need_replay_incompatible_with_at_least_once_inbox/);
});

for (const crash of ['before-effect', 'after-effect']) {
  test(`G5 actual QUIC SIGKILL ${crash} never reexecutes the reserved ID after process restart`, { timeout: 20000 }, async t => {
    const f = fixture(t), identity = createIdentity();
    const effectsPath = join(f.root, 'effects.txt'), filePath = join(f.root, 'crash.sqlite');
    async function worker(mode) {
      const child = fork(new URL('./fixtures/g5-quic-crash-worker.mjs', import.meta.url), [], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
      const ready = once(child, 'message');
      child.send({ identity, tls: f.tls, filePath, effectsPath, crash: mode });
      const [endpoint] = await ready;
      return { child, endpoint, exit: once(child, 'exit') };
    }
    const first = await worker(crash), client = await f.transport();
    const envelope = need(client, { identity }, 'kill-' + crash);
    const connection = await client.connect({ host: '127.0.0.1', port: first.endpoint.port });
    // QUIC may wait for its idle timeout after SIGKILL; attach rejection handling
    // immediately and close the connection after observing the actual OS signal.
    const lost = client.sendEnvelope(connection, envelope).catch(() => null);
    const [code, signal] = await first.exit;
    assert.equal(code, null); assert.equal(signal, 'SIGKILL');
    await client.disconnect(connection); await lost;
    const second = await worker(null);
    await assert.rejects(client.sendEnvelope(await client.connect({ host: '127.0.0.1', port: second.endpoint.port }), envelope), duplicate);
    let effects = [];
    try { effects = readFileSync(effectsPath, 'utf8').trim().split('\n').filter(Boolean); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    assert.equal(effects.length, crash === 'after-effect' ? 1 : 0);
    second.child.send('close'); await second.exit;
  });
}
