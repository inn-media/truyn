import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { PeerDiscovery, createPeerRecord } from '../network/discovery/peer-discovery.js';

function peerRecord(index) {
  const identity = createIdentity();
  return createPeerRecord({
    identity,
    endpoints: [`quic://127.0.0.1:${6100 + index}`],
    ttlMs: 60_000
  });
}

test('refreshRoutingTable bounds target concurrency and propagates one RPC deadline', async () => {
  const identity = createIdentity();
  const peers = Array.from({ length: 8 }, (_, index) => peerRecord(index));
  let inheritedDeadline = null;
  const discovery = new PeerDiscovery({
    identity,
    rpc: {
      withDeadline(deadlineAt, operation) {
        inheritedDeadline = deadlineAt;
        return operation();
      },
      async findNode() { return { records: [] }; }
    }
  });
  peers.forEach((peer) => discovery.ingest(peer));

  let active = 0;
  let maxActive = 0;
  discovery.walk = async (targetNodeId) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active -= 1;
    return {
      found: discovery.get(targetNodeId),
      queried: [],
      rounds: 1,
      responses: 0
    };
  };

  const startedAt = Date.now();
  const result = await discovery.refreshRoutingTable({
    targets: peers.map((peer) => peer.nodeId),
    targetCount: peers.length,
    targetConcurrency: 4,
    timeoutMs: 1_000
  });

  assert.equal(result.refreshed, true);
  assert.equal(result.walks.length, peers.length);
  assert.ok(maxActive > 1 && maxActive <= 4, `maxActive=${maxActive}`);
  assert.ok(inheritedDeadline >= startedAt + 900);
  assert.ok(inheritedDeadline <= Date.now() + 1_000);
});

test('refreshRoutingTable fails closed when its aggregate deadline is exceeded', async () => {
  const identity = createIdentity();
  const peers = [peerRecord(20), peerRecord(21)];
  const discovery = new PeerDiscovery({
    identity,
    rpc: {
      withDeadline(_deadlineAt, operation) { return operation(); },
      async findNode() { return { records: [] }; }
    }
  });
  peers.forEach((peer) => discovery.ingest(peer));

  discovery.walk = async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { found: null, queried: [], rounds: 1, responses: 0 };
  };

  const result = await discovery.refreshRoutingTable({
    targets: peers.map((peer) => peer.nodeId),
    targetCount: peers.length,
    targetConcurrency: 1,
    timeoutMs: 10
  });

  assert.equal(result.refreshed, false);
  assert.equal(result.reason, 'refresh_deadline_exceeded');
  assert.ok(result.walks.length < peers.length);
});
