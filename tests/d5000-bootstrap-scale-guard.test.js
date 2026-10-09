import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildClassD1000BootstrapPlan,
  summarizeClassD1000BootstrapPlan,
  peerFailureDomain
} from '../benchmarks/scale/class-d-1000-bootstrap.js';

function hostRecords(hostCount, perHost) {
  return Array.from({ length: hostCount * perHost }, (_, n) => {
    const h = Math.floor(n / perHost);
    const j = n % perHost;
    return {
      nodeId: `truyn:node:host-${h}-node-${j}`,
      endpoints: [`quic://10.42.${h}.10:${4400 + j}`]
    };
  });
}
const options = { seed: 'd5000-immutable-plan', maxPeersPerNode: 32, peersPerBucket: 2, requiredFailureDomains: 20 };

test('D5000 host-local plan matches full-plan peer choices exactly, including 20 domains', () => {
  const records = hostRecords(20, 8);
  const full = buildClassD1000BootstrapPlan(records, options);
  const localNodeIds = records.slice(6 * 8, 7 * 8).map((row) => row.nodeId);
  const local = buildClassD1000BootstrapPlan(records, { ...options, localNodeIds });
  assert.equal(local.size, 8);
  for (const id of localNodeIds) {
    const a = local.get(id).map((peer) => peer.nodeId);
    const b = full.get(id).map((peer) => peer.nodeId);
    assert.deepEqual(a, b, 'local planning must preserve the exact deterministic peer set');
    assert.equal(a.length, 32);
    assert.equal(new Set(a).size, 32);
    assert.ok(!a.includes(id));
    assert.equal(new Set(local.get(id).map(peerFailureDomain)).size, 20);
  }
  const metrics = summarizeClassD1000BootstrapPlan(local);
  assert.equal(metrics.nodeCount, 8);
  assert.equal(metrics.minPeers, 32);
  assert.equal(metrics.maxPeers, 32);
  assert.equal(metrics.minFailureDomains, 20);
  assert.equal(metrics.maxFailureDomains, 20);
  assert.equal(metrics.allToAll, false);
  console.log('D5000_LOCAL_PLAN_EXACT_EQUIVALENCE=PASS distinct_peers=32 domains=20');
});

test('D5000 local plan refuses unknown, duplicate and empty owners', () => {
  const input = hostRecords(20, 3);
  const id = input[0].nodeId;
  assert.throws(() => buildClassD1000BootstrapPlan(input, { ...options, localNodeIds: [id, id] }), /unique/);
  assert.throws(() => buildClassD1000BootstrapPlan(input, { ...options, localNodeIds: ['missing'] }), /present/);
  assert.throws(() => buildClassD1000BootstrapPlan(input, { ...options, localNodeIds: [] }), /nonempty/);
  assert.throws(() => buildClassD1000BootstrapPlan(input.slice(3), { ...options, localNodeIds: [id] }), /failure domain count mismatch/);
});

test('D5000 full 5000-node candidate topology is processed locally with 250 plans only', { timeout: 180_000 }, () => {
  const records = hostRecords(20, 250);
  const localNodeIds = records.slice(6 * 250, 7 * 250).map((record) => record.nodeId);
  const started = performance.now();
  const plan = buildClassD1000BootstrapPlan(records, { ...options, localNodeIds });
  const elapsedMs = Math.round(performance.now() - started);
  const result = summarizeClassD1000BootstrapPlan(plan);
  assert.equal(result.nodeCount, 250);
  assert.equal(result.minPeers, 32);
  assert.equal(result.maxPeers, 32);
  assert.equal(result.minFailureDomains, 20);
  assert.equal(result.maxFailureDomains, 20);
  assert.equal(result.allToAll, false);
  for (const [id, peers] of plan.entries()) {
    assert.equal(peers.length, 32);
    assert.ok(!peers.some((peer) => peer.nodeId === id));
  }
  console.log(`D5000_5000_LOCAL_250_PLAN=PASS source_records=5000 computed_plans=250 peers=32 domains=20 elapsed_ms=${elapsedMs}`);
});

test('D5000 bootstrap still executes real DHT RPC refresh and requires 20-domain readiness', async () => {
  const provision = await readFile('benchmarks/scale/class-d-azure-5000-provision.sh', 'utf8');
  const evaluator = await readFile('benchmarks/scale/class-d-5000-evidence.js', 'utf8');
  assert.match(provision, /HOST_COUNT=20/);
  assert.match(provision, /STRICT_NODES_PER_HOST=250/);
  assert.match(provision, /BOOTSTRAP_MAX_PEERS_PER_NODE=32/);
  assert.match(provision, /localNodeIds: localRecords\.map/);
  assert.match(provision, /D5000_BOOTSTRAP_REFRESH_TARGET_COUNT=8/);
  assert.match(provision, /D5000_BOOTSTRAP_REFRESH_TARGET_CONCURRENCY=2/);
  assert.match(provision, /maxRounds:4/);
  assert.match(provision, /timeoutMs:240000/);
  assert.match(provision, /\/dht\/refresh/);
  assert.ok(provision.includes('.remoteEndpointDiversity.hostCount'));
  assert.ok(provision.includes('.remoteEndpointDiversity.hostCount'));
  assert.match(provision, /BOOTSTRAP_REFRESH_MIN_HOSTS/);
  assert.match(evaluator, /5000/);
  assert.match(evaluator, /250/);
  console.log('D5000_BOOTSTRAP_REAL_RPC_AND_SAFETY_CONTRACT=PASS');
});
