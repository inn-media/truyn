import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createIdentity } from '../core/identity/index.js';
import { PeerDiscovery, createPeerRecord } from '../network/discovery/peer-discovery.js';

function peerRecord(index) {
  const identity = createIdentity();
  return createPeerRecord({
    identity,
    endpoints: [`quic://127.0.0.1:${4800 + index}`],
    ttlMs: 60_000
  });
}

test('refreshRoutingTable is unavailable without the custom discovery RPC', async () => {
  const identity = createIdentity();
  const first = peerRecord(1);
  const discovery = new PeerDiscovery({ identity });
  discovery.ingest(first);

  const result = await discovery.refreshRoutingTable({ targets: [first.nodeId], targetCount: 1 });

  assert.equal(result.refreshed, false);
  assert.equal(result.reason, 'rpc_unavailable');
  assert.deepEqual(result.targets, [first.nodeId]);
  assert.deepEqual(result.walks, []);
  assert.deepEqual(result.queriedPeers, []);
  assert.equal(result.responses, 0);
  assert.equal(result.routingSizeDelta, 0);
  assert.equal(result.validPeersDelta, 0);
  assert.equal(result.before.routingSize, result.after.routingSize);
});

test('refreshRoutingTable expands peer state through PeerDiscovery.walk', async () => {
  const identity = createIdentity();
  const first = peerRecord(10);
  const second = peerRecord(11);
  const target = peerRecord(12);
  const rpcCalls = [];
  const discovery = new PeerDiscovery({
    identity,
    alpha: 1,
    rpc: {
      findNode: async (peer) => {
        rpcCalls.push(peer.nodeId);
        if (peer.nodeId === first.nodeId) return { records: [second] };
        if (peer.nodeId === second.nodeId) return { records: [target] };
        return { records: [] };
      }
    }
  });
  discovery.ingest(first);

  const result = await discovery.refreshRoutingTable({ targets: [target.nodeId], targetCount: 1, maxRounds: 2 });

  assert.equal(result.refreshed, true);
  assert.deepEqual(result.targets, [target.nodeId]);
  assert.equal(result.walks.length, 1);
  assert.equal(result.walks[0].targetNodeId, target.nodeId);
  assert.equal(result.walks[0].found, true);
  assert.equal(result.walks[0].foundNodeId, target.nodeId);
  assert.deepEqual(result.walks[0].queried, [first.nodeId, second.nodeId]);
  assert.deepEqual(result.queriedPeers, [first.nodeId, second.nodeId]);
  assert.equal(result.responses, 2);
  assert.equal(result.routingSizeDelta, 2);
  assert.equal(result.validPeersDelta, 2);
  assert.equal(result.before.validPeers, 1);
  assert.equal(result.after.validPeers, 3);
  assert.equal(discovery.get(target.nodeId).nodeId, target.nodeId);
  assert.deepEqual(rpcCalls, [first.nodeId, second.nodeId]);
});

test('refreshRoutingTable defaults to deterministic custom refresh targets and keeps walking after found records', async () => {
  const identity = createIdentity();
  const first = peerRecord(20);
  const second = peerRecord(21);
  const discovery = new PeerDiscovery({
    identity,
    rpc: { findNode: async () => ({ records: [] }) }
  });
  discovery.ingest(first);
  discovery.ingest(second);

  const calls = [];
  discovery.walk = async (targetNodeId, options) => {
    calls.push({ targetNodeId, options });
    return { targetNodeId, found: discovery.get(targetNodeId), queried: [], rounds: 0, responses: 0 };
  };

  const result = await discovery.refreshRoutingTable({ targetCount: 2, maxRounds: 5 });

  assert.equal(result.refreshed, true);
  assert.equal(result.targets.length, 2);
  assert.equal(new Set(result.targets).size, 2);
  assert.equal(result.targets.includes(identity.nodeId), false);
  assert.deepEqual(calls.map((call) => call.targetNodeId), result.targets);
  assert.deepEqual(calls.map((call) => call.options), [
    { maxRounds: 5, stopOnFound: false },
    { maxRounds: 5, stopOnFound: false }
  ]);
});

test('PeerDiscovery refresh stays on the custom path and does not import the libp2p helper', async () => {
  const source = await readFile(new URL('../network/discovery/peer-discovery.js', import.meta.url), 'utf8');

  assert.equal(source.includes('refreshKademliaRoutingTable'), false);
  assert.equal(source.includes('libp2p'), false);
  assert.equal(source.includes('refreshRoutingTable'), true);
});
