import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildClassD1000BootstrapPlan,
  summarizeClassD1000BootstrapPlan
} from '../benchmarks/scale/class-d-1000-bootstrap.js';
import { xorDistance } from '../network/dht/kademlia.js';

function records(count) {
  return Array.from({ length: count }, (_, index) => ({ nodeId: `truyn:node:scale-${index}` }));
}

function bucketIndex(localNodeId, peerNodeId) {
  const distance = xorDistance(localNodeId, peerNodeId);
  return distance === 0n ? -1 : distance.toString(2).length - 1;
}

function peerNodeIds(plan, nodeId) {
  return plan.get(nodeId).map((peer) => peer.nodeId);
}

test('D-1000 bootstrap plan preserves production-scale XOR invariants', () => {
  const input = records(1000);
  const nodeIds = new Set(input.map((record) => record.nodeId));
  const options = { seed: 'gate-seed', maxPeersPerNode: 32, peersPerBucket: 2 };
  const first = buildClassD1000BootstrapPlan(input, options);
  const second = buildClassD1000BootstrapPlan(input, options);
  const summary = summarizeClassD1000BootstrapPlan(first);

  assert.equal(summary.nodeCount, 1000);
  assert.equal(summary.minPeers, 32);
  assert.equal(summary.maxPeers, 32);
  assert.equal(summary.allToAll, false);

  for (const record of input) {
    const peers = first.get(record.nodeId);
    const peerIds = peerNodeIds(first, record.nodeId);
    const deterministicPeerIds = peerNodeIds(second, record.nodeId);
    const buckets = new Set(peerIds.map((peerId) => bucketIndex(record.nodeId, peerId)));

    assert.equal(peers.length, 32, `expected 32 bounded peers for ${record.nodeId}`);
    assert.equal(new Set(peerIds).size, peers.length, `expected unique peers for ${record.nodeId}`);
    assert.ok(peerIds.every((peerId) => peerId !== record.nodeId), `expected no self peer for ${record.nodeId}`);
    assert.ok(peerIds.every((peerId) => nodeIds.has(peerId)), `expected every peer to come from the input set for ${record.nodeId}`);
    assert.deepEqual(peerIds, deterministicPeerIds, `expected deterministic peer order for ${record.nodeId}`);
    assert.ok(buckets.size >= 4, `expected XOR bucket diversity for ${record.nodeId}, got ${buckets.size}`);
  }
});

test('D-1000 bootstrap plan does not reuse a host-common seed set', () => {
  const input = records(1000);
  const plan = buildClassD1000BootstrapPlan(input, {
    seed: 'host-common-seed-gate',
    maxPeersPerNode: 32,
    peersPerBucket: 2
  });

  for (let host = 0; host < 20; host += 1) {
    const signatures = [];
    for (let node = 0; node < 50; node += 1) {
      const nodeId = `truyn:node:scale-${host * 50 + node}`;
      signatures.push(peerNodeIds(plan, nodeId).join('\n'));
    }

    assert.equal(
      new Set(signatures).size,
      50,
      `expected 50 distinct per-node bootstrap seed sets for host ${host}`
    );
  }
});

test('D-1000 Azure provisioner uses the per-node XOR bootstrap planner', async () => {
  const provisioner = await readFile(new URL('../benchmarks/scale/class-d-azure-1000-provision.sh', import.meta.url), 'utf8');

  assert.match(provisioner, /BOOTSTRAP_MAX_PEERS_PER_NODE=32/);
  assert.match(provisioner, /BOOTSTRAP_PEERS_PER_BUCKET=2/);
  assert.match(provisioner, /buildClassD1000BootstrapPlan/);
  assert.match(provisioner, /bootstrap-plan-by-node\.json/);
  assert.match(provisioner, /plan=per-node-xor/);
  assert.doesNotMatch(provisioner, /BRIDGES_PER_REMOTE_HOST/);
  assert.doesNotMatch(provisioner, /value\[0:\$bridges\]/);
});

test('D-1000 planner rejects duplicate identities', () => {
  assert.throws(
    () => buildClassD1000BootstrapPlan([{ nodeId: 'a' }, { nodeId: 'a' }]),
    /duplicate nodeId/
  );
});
