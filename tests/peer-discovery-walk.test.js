import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { PeerDiscovery, createPeerRecord } from '../network/discovery/peer-discovery.js';

function peerRecord(index) {
  const identity = createIdentity();
  return createPeerRecord({
    identity,
    endpoints: [`quic://127.0.0.1:${4700 + index}`],
    ttlMs: 60_000
  });
}

function chainDiscovery({ identity, first, second, target, queried = [] }) {
  const discovery = new PeerDiscovery({
    identity,
    alpha: 1,
    rpc: {
      findNode: async (peer) => {
        queried.push(peer.nodeId);
        if (peer.nodeId === first.nodeId) return { records: [second] };
        if (peer.nodeId === second.nodeId) return { records: [target] };
        return { records: [] };
      }
    }
  });
  discovery.ingest(first);
  return discovery;
}

test('findNode preserves self, local-hit, and no-rpc semantics', async () => {
  const identity = createIdentity();
  const target = peerRecord(1);
  let rpcCalls = 0;
  const discovery = new PeerDiscovery({
    identity,
    rpc: { findNode: async () => { rpcCalls += 1; return { records: [] }; } }
  });
  discovery.ingest(target);

  assert.equal(await discovery.findNode(identity.nodeId), null);
  const local = await discovery.findNode(target.nodeId);
  assert.equal(local.nodeId, target.nodeId);
  assert.equal(rpcCalls, 0, 'findNode must not walk for self or local hits');

  const noRpc = new PeerDiscovery({ identity });
  assert.equal(await noRpc.findNode(target.nodeId), null);
});

test('findNode delegates iterative remote lookup to walk without changing result shape', async () => {
  const identity = createIdentity();
  const target = peerRecord(2);
  const discovery = new PeerDiscovery({
    identity,
    rpc: { findNode: async () => { throw new Error('findNode must delegate to walk'); } }
  });
  let delegated = false;
  discovery.walk = async (targetNodeId, options) => {
    delegated = true;
    assert.equal(targetNodeId, target.nodeId);
    assert.deepEqual(options, { maxRounds: 3, stopOnFound: true });
    return { targetNodeId, found: target, queried: [], rounds: 0, responses: 0 };
  };

  const found = await discovery.findNode(target.nodeId, { maxRounds: 3 });
  assert.equal(found.nodeId, target.nodeId);
  assert.equal(delegated, true);
});

test('walk respects maxRounds before the target record is reached', async () => {
  const identity = createIdentity();
  const first = peerRecord(10);
  const second = peerRecord(11);
  const target = peerRecord(12);
  const queried = [];
  const discovery = chainDiscovery({ identity, first, second, target, queried });

  const bounded = await discovery.walk(target.nodeId, { maxRounds: 1 });
  assert.equal(bounded.found, null);
  assert.deepEqual(bounded.queried, [first.nodeId]);
  assert.equal(bounded.rounds, 1);
  assert.equal(bounded.responses, 1);
  assert.deepEqual(queried, [first.nodeId]);
});

test('walk performs bounded iterative lookup and stops when the target record is found', async () => {
  const identity = createIdentity();
  const first = peerRecord(20);
  const second = peerRecord(21);
  const target = peerRecord(22);
  const queried = [];
  const discovery = chainDiscovery({ identity, first, second, target, queried });

  const found = await discovery.walk(target.nodeId, { maxRounds: 2 });
  assert.equal(found.found.nodeId, target.nodeId);
  assert.deepEqual(found.queried, [first.nodeId, second.nodeId]);
  assert.equal(found.rounds, 2);
  assert.equal(found.responses, 2);
  assert.deepEqual(queried, [first.nodeId, second.nodeId]);
});
