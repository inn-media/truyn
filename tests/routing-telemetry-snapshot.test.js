import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { KademliaRoutingTable, KADEMLIA_ID_BITS } from '../network/dht/kademlia.js';
import { createPeerRecord, PeerDiscovery } from '../network/discovery/peer-discovery.js';

function livePeer({ port, now }) {
  const identity = createIdentity();
  return createPeerRecord({
    identity,
    endpoints: [`quic://127.0.0.1:${port}`],
    ttlMs: 60_000,
    issuedAt: new Date(now - 1_000).toISOString()
  });
}

function occupancySum(snapshot) {
  return snapshot.bucketOccupancy.reduce((sum, bucket) => sum + bucket.count, 0);
}

test('KademliaRoutingTable routingSnapshot reports routing occupancy metrics without changing peer snapshots', () => {
  const local = createIdentity();
  const table = new KademliaRoutingTable({ localNodeId: local.nodeId, k: 8 });
  const now = Date.now();
  const peers = [0, 1, 2].map((index) => livePeer({ port: 4600 + index, now }));

  for (const peer of peers) {
    assert.equal(table.upsert({ nodeId: peer.nodeId, endpoints: peer.endpoints, publicKey: peer.publicKey }), true);
  }
  assert.equal(table.upsert({ nodeId: 'truyn:test:routing-hint-without-endpoint' }), true);

  const snapshot = table.routingSnapshot();
  assert.equal(snapshot.localNodeId, local.nodeId);
  assert.equal(snapshot.k, 8);
  assert.equal(snapshot.bucketCount, KADEMLIA_ID_BITS);
  assert.equal(snapshot.routingSize, 4);
  assert.equal(snapshot.validPeers, 3);
  assert.equal(snapshot.bucketOccupancy.length, KADEMLIA_ID_BITS);
  assert.equal(occupancySum(snapshot), snapshot.routingSize);
  assert.equal(snapshot.populatedBuckets, snapshot.bucketOccupancy.filter((bucket) => bucket.count > 0).length);
  assert.ok(snapshot.populatedBuckets >= 1);

  assert.equal(table.snapshot().length, snapshot.routingSize, 'legacy peer snapshot must remain peer-list compatible');
});

test('PeerDiscovery routingSnapshot separates live signed peers from stale routing hints', () => {
  const identity = createIdentity();
  const discovery = new PeerDiscovery({ identity, k: 8 });
  const now = Date.now();
  const peers = [0, 1, 2].map((index) => livePeer({ port: 4700 + index, now }));

  for (const peer of peers) {
    assert.deepEqual(discovery.ingest(peer, { now }).accepted, true);
  }
  discovery.routing.upsert({
    nodeId: 'truyn:test:stale-routing-hint',
    endpoints: ['quic://127.0.0.1:4799']
  });

  const snapshot = discovery.routingSnapshot({ now });
  assert.equal(snapshot.localNodeId, identity.nodeId);
  assert.equal(snapshot.routingSize, 4);
  assert.equal(snapshot.validPeers, 3);
  assert.equal(snapshot.recordCount, 3);
  assert.equal(snapshot.staleRoutingPeers, 1);
  assert.equal(snapshot.bucketOccupancy.length, KADEMLIA_ID_BITS);
  assert.equal(occupancySum(snapshot), snapshot.routingSize);
  assert.equal(snapshot.populatedBuckets, snapshot.bucketOccupancy.filter((bucket) => bucket.count > 0).length);

  assert.equal(discovery.snapshot({ now }).length, snapshot.validPeers, 'legacy live-record snapshot must remain record-list compatible');
});
