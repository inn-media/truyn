import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createIdentity } from '../core/identity/index.js';
import { KademliaRoutingTable } from '../network/dht/kademlia.js';
import { PeerDiscovery, createPeerRecord } from '../network/discovery/peer-discovery.js';
import { RpcLaneScheduler } from '../network/discovery/quic-rpc.js';

test('Kademlia O(1) membership exactly follows bucket eviction, replacement and restore', () => {
  const owner = createIdentity();
  const table = new KademliaRoutingTable({ localNodeId: owner.nodeId, k: 1 });
  const peers = Array.from({ length: 80 }, () => createIdentity().nodeId);
  for (const id of peers) {
    table.upsert({ nodeId: id, endpoints: ['quic://127.0.0.1:4400'] });
    const snapshotIds = new Set(table.snapshot().map(x => x.nodeId));
    assert.equal(table.size(), snapshotIds.size);
    for (const peerId of peers) assert.equal(table.has(peerId), snapshotIds.has(peerId));
  }
  const surviving = table.snapshot();
  for (const p of surviving) assert.equal(table.remove(p.nodeId), true);
  assert.equal(table.size(), 0);
  for (const p of surviving) assert.equal(table.has(p.nodeId), false);
  table.restore(surviving);
  assert.equal(table.size(), surviving.length);
  assert.deepEqual(new Set(table.snapshot().map(x => x.nodeId)), new Set(surviving.map(x => x.nodeId)));
});

test('RPC scheduler reports actual queue depth separately from cumulative enqueues', async () => {
  const scheduler = new RpcLaneScheduler({ laneLimits: { background: 1 }, perPeerInFlight: 1 });
  const firstRelease = await scheduler.acquire('background', 'peer-a', Date.now() + 10_000);
  const waiter = scheduler.acquire('background', 'peer-b', Date.now() + 10_000);
  let snapshot = scheduler.snapshot().background;
  assert.equal(snapshot.inFlight, 1);
  assert.equal(snapshot.queued, 1);
  assert.equal(snapshot.queuedTotal, 1);
  firstRelease();
  const secondRelease = await waiter;
  snapshot = scheduler.snapshot().background;
  assert.equal(snapshot.inFlight, 1);
  assert.equal(snapshot.queued, 0);
  assert.equal(snapshot.queuedTotal, 1);
  secondRelease();
  snapshot = scheduler.snapshot().background;
  assert.equal(snapshot.queued, 0);
  assert.equal(snapshot.inFlight, 0);
});

test('bounded maintenance persistence never serializes an unbounded list of encountered peers', () => {
  const owner = createIdentity();
  const discovery = new PeerDiscovery({ identity: owner, k: 2, maxCachedRecords: 16 });
  const issuedAt = new Date().toISOString();
  for (let i = 0; i < 150; i += 1) {
    const identity = createIdentity();
    const record = createPeerRecord({
      identity, endpoints: [`quic://127.0.0.1:${5100 + i}`], sequence: 1,
      issuedAt, ttlMs: 600_000
    });
    assert.equal(discovery.ingest(record).accepted, true);
  }
  assert.ok(discovery.recordEvictions > 0);
  assert.ok(discovery.durableSnapshot().length <= discovery.routing.size() + 16 + 32);
  for (const record of discovery.routingRecords()) assert.ok(discovery.get(record.nodeId));
});

test('D-5000 acceptance retains full 32/4 refresh while network maintenance becomes bounded', async () => {
  const [provision, runtime, discovery] = await Promise.all([
    readFile('benchmarks/scale/class-d-azure-5000-provision.sh', 'utf8'),
    readFile('network/runtime.js', 'utf8'),
    readFile('network/discovery/peer-discovery.js', 'utf8')
  ]);
  assert.match(provision, /^D5000_BOOTSTRAP_REFRESH_TARGET_COUNT=32$/m);
  assert.match(provision, /^D5000_BOOTSTRAP_REFRESH_TARGET_CONCURRENCY=4$/m);
  assert.match(provision, /STRICT_NODES_PER_HOST=250/);
  assert.match(provision, /HOST_COUNT=20/);
  assert.match(runtime, /this\.discovery\.routingRecords\(\)/);
  assert.match(discovery, /refreshed: !deadlineExceeded && !shed/);
});
