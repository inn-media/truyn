import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createIdentity } from '../core/identity/index.js';
import { KademliaRoutingTable, createDhtRecord, verifyDhtRecord } from '../network/dht/kademlia.js';
import { PeerDiscovery, createPeerRecord, verifyPeerRecord } from '../network/discovery/peer-discovery.js';
import { DhtReplicationManager } from '../network/replication/dht-replication.js';
import { RpcLaneScheduler } from '../network/discovery/quic-rpc.js';
import { normalizeTransientQuicUdpSendError } from '../network/transport/quic.js';
import { installProcessGuards, isConnectionScopedQuicError } from '../network/testnet/process-guards.js';
import { errors as quicErrors } from '@matrixai/quic';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nodeId = () => `truyn:node:${randomBytes(32).toString('hex')}`;
const peerRecord = (port = 4700) => createPeerRecord({
  identity: createIdentity(),
  endpoints: [`quic://127.0.0.1:${port}`],
  ttlMs: 60_000
});

test('A20 cached Kademlia closest preserves exact XOR ordering', () => {
  const local = nodeId();
  const table = new KademliaRoutingTable({ localNodeId: local, k: 20 });
  for (let i = 0; i < 120; i += 1) table.upsert({ nodeId: nodeId(), endpoints: ['quic://10.0.0.1:1'] });
  const hash = (value) => BigInt(`0x${createHash('sha256').update(String(value)).digest('hex')}`);
  for (let round = 0; round < 12; round += 1) {
    const target = round % 3 === 0 ? `ns:key-${round}` : nodeId();
    const reference = table.snapshot().sort((a, b) => {
      const da = hash(a.nodeId) ^ hash(target);
      const db = hash(b.nodeId) ^ hash(target);
      return da < db ? -1 : da > db ? 1 : a.nodeId.localeCompare(b.nodeId);
    }).slice(0, 20).map((peer) => peer.nodeId);
    assert.deepEqual(table.closest(target, 20).map((peer) => peer.nodeId), reference);
  }
});

test('A20 signature caches never bypass body, identity or lease validation', () => {
  const peer = peerRecord();
  assert.equal(verifyPeerRecord(peer).ok, true);
  assert.equal(verifyPeerRecord(peer).ok, true);
  assert.equal(verifyPeerRecord({ ...peer, endpoints: ['quic://203.0.113.9:4700'] }).reason, 'peer_record_id');
  assert.equal(verifyPeerRecord(peer, { now: Date.parse(peer.expiresAt) + 1 }).reason, 'peer_record_expired');

  const publisher = createIdentity();
  const dht = createDhtRecord({ identity: publisher, namespace: 'a20', key: 'k', value: { v: 1 }, ttlMs: 60_000 });
  assert.equal(verifyDhtRecord(dht).ok, true);
  assert.equal(verifyDhtRecord(dht).ok, true);
  assert.equal(verifyDhtRecord({ ...dht, value: { v: 2 } }).reason, 'dht_value_digest_mismatch');
  assert.equal(verifyDhtRecord(dht, { now: Date.parse(dht.expiresAt) + 1 }).reason, 'dht_record_expired');
});

test('A20 RPC lanes isolate critical capacity and enforce per-peer queue deadline', async () => {
  const scheduler = new RpcLaneScheduler({
    laneLimits: { critical: 1, control: 1, background: 1 },
    perPeerInFlight: 1
  });
  const releaseBackground = await scheduler.acquire('background', 'slow-background', Date.now() + 1_000);
  const releaseCritical = await scheduler.acquire('critical', 'critical-peer', Date.now() + 1_000);
  releaseCritical();

  const first = await scheduler.acquire('control', 'same-peer', Date.now() + 1_000);
  await assert.rejects(
    scheduler.acquire('control', 'same-peer', Date.now() + 30),
    (error) => error.code === 'TRUYN_DHT_RPC_TIMEOUT'
  );
  assert.equal(scheduler.snapshot().control.expiredInQueue, 1);
  first();
  releaseBackground();
});

test('A20 Kademlia walk hedges a slow alpha peer and identical walks are single-flight', async () => {
  const identity = createIdentity();
  const slow = peerRecord(4801);
  const fast = peerRecord(4802);
  const target = peerRecord(4803);
  let calls = 0;
  const discovery = new PeerDiscovery({
    identity,
    alpha: 1,
    rpc: {
      timeoutMs: 1_000,
      currentLane: () => 'critical',
      async findNode(peer) {
        calls += 1;
        if (peer.nodeId === slow.nodeId) { await sleep(900); return { records: [] }; }
        if (peer.nodeId === fast.nodeId) return { records: [target] };
        return { records: [] };
      }
    }
  });
  discovery.ingest(slow);
  discovery.ingest(fast);
  const started = Date.now();
  const result = await discovery.walk(target.nodeId, { maxRounds: 4, stopOnFound: true });
  assert.equal(result.found?.nodeId, target.nodeId);
  assert.ok(Date.now() - started < 800, 'hedged lookup must not wait for the slow peer');

  const shared = new PeerDiscovery({
    identity: createIdentity(),
    alpha: 1,
    rpc: {
      currentLane: () => 'control',
      async findNode() { await sleep(20); return { records: [] }; }
    }
  });
  shared.ingest(peerRecord(4811));
  let sharedCalls = 0;
  shared.rpc.findNode = async () => { sharedCalls += 1; await sleep(20); return { records: [] }; };
  const unknown = nodeId();
  await Promise.all([
    shared.walk(unknown, { maxRounds: 2 }),
    shared.walk(unknown, { maxRounds: 2 }),
    shared.walk(unknown, { maxRounds: 2 })
  ]);
  assert.equal(sharedCalls, 1);
});

test('A20 periodic refresh exits after convergence but protects genuinely near-expiry targets', async () => {
  const identity = createIdentity();
  const discovery = new PeerDiscovery({ identity, rpc: { async findNode() { return { records: [] }; } } });
  for (let i = 0; i < 30; i += 1) {
    discovery.ingest(createPeerRecord({
      identity: createIdentity(),
      endpoints: [`quic://127.0.0.1:${5100 + i}`],
      ttlMs: 1_800_000
    }));
  }
  let walks = 0;
  discovery.walk = async (targetNodeId) => {
    walks += 1;
    return { targetNodeId, found: null, queried: [], rounds: 0, responses: 0 };
  };
  const result = await discovery.refreshRoutingTable({
    targetCount: 30,
    maxRounds: 4,
    earlyExitIdleWalks: 4,
    nearExpiryHorizonMs: 120_000
  });
  assert.equal(result.reason, 'refresh_converged');
  assert.equal(walks, 4);
});

test('A20 replication keeps RF=3/minAcks=2 and replaces failed placement without retry waves', async () => {
  const identity = createIdentity();
  const peers = ['p1', 'p2', 'p3', 'p4'].map((id, i) => ({ nodeId: id, endpoints: [`quic://10.0.0.${i + 1}:5000`] }));
  const discovery = {
    identity,
    closest: () => peers,
    walk: async () => ({ queried: [], rounds: 0, responses: 0 })
  };
  const stored = new Map();
  const recordStore = {
    put(record) { stored.set(record.recordId, record); return { accepted: true }; },
    get() { return []; }
  };
  const attempts = [];
  const rpc = {
    withDeadline: (_deadline, operation) => operation(),
    async store(peer) {
      attempts.push(peer.nodeId);
      if (peer.nodeId === 'p1') throw new Error('slow-peer-failed');
      return { stored: true };
    }
  };
  const manager = new DhtReplicationManager({
    discovery,
    rpc,
    recordStore,
    replicationFactor: 3,
    writeQuorum: 2,
    writeTimeoutMs: 5_000,
    quorumGraceMs: 25
  });
  const record = createDhtRecord({ identity, namespace: 'a20', key: 'write', value: { ok: true } });
  const result = await manager.put(record, { replicationFactor: 3, minAcks: 2, lookupRounds: 0 });
  assert.ok(result.acknowledgements >= 2);
  assert.equal(result.replicationFactor, 3);
  assert.ok(attempts.includes('p3'), 'failed placement is immediately replaced by the next candidate');
});

test('A20 transient UDP policy contains buffer pressure but does not classify ENOMEM as harmless', () => {
  for (const code of ['EPERM', 'ENOBUFS', 'EAGAIN', 'EWOULDBLOCK']) {
    const normalized = normalizeTransientQuicUdpSendError(Object.assign(new Error(code), { code, syscall: 'send' }));
    assert.equal(normalized.code, 'ENETUNREACH', code);
    assert.equal(normalized.transient, true);
  }
  const enomem = Object.assign(new Error('ENOMEM'), { code: 'ENOMEM', syscall: 'send' });
  assert.equal(normalizeTransientQuicUdpSendError(enomem), enomem);
});

test('A20 process guards contain only connection-scoped QUIC failures and fail closed otherwise', () => {
  const listeners = {};
  const target = { pid: 1, on: (event, handler) => { listeners[event] = handler; } };
  const lines = [];
  const exits = [];
  const stats = installProcessGuards({
    target,
    write: (line) => lines.push(line),
    exit: (code) => exits.push(code)
  });

  listeners.uncaughtException(new quicErrors.ErrorQUICConnectionInternal('connection'));
  assert.equal(stats.contained, 1);
  assert.deepEqual(exits, []);

  listeners.unhandledRejection(new Error('unknown-background-rejection'));
  assert.equal(stats.unhandledRejections, 1);
  assert.deepEqual(exits, [70]);

  listeners.uncaughtException(new quicErrors.ErrorQUICServerInternal('listener-broken'));
  assert.deepEqual(exits, [70, 70]);
  assert.ok(lines.some((line) => line.startsWith('TRUYN_NODE_FATAL ')));
  assert.equal(isConnectionScopedQuicError(new quicErrors.ErrorQUICSocketInternal('socket')), false);
});
