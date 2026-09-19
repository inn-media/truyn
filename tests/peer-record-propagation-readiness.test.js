import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIdentity } from '../core/identity/index.js';
import { createPeerRecord } from '../network/discovery/peer-discovery.js';
import { TruynNetworkNode } from '../network/runtime.js';

async function generateTls(root) {
  const keyPath = join(root, 'key.pem');
  const certPath = join(root, 'cert.pem');
  const run = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath,
    '-subj', '/CN=127.0.0.1', '-days', '1',
    '-addext', 'subjectAltName=IP:127.0.0.1'
  ], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`openssl failed: ${run.stderr}`);
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function eventually(check, { timeoutMs = 5_000, intervalMs = 25, message = 'condition_not_met' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(intervalMs);
  }
  assert.fail(message);
}

function remoteRecord(port) {
  const identity = createIdentity();
  return createPeerRecord({
    identity,
    endpoints: [`quic://127.0.0.1:${port}`],
    ttlMs: 60_000
  });
}

test('production propagation: bootstrap placement publishes the current signed self record before reporting propagation ready', { timeout: 15_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-peer-propagation-bootstrap-'));
  const tls = await generateTls(root);
  const node = new TruynNetworkNode({
    identity: createIdentity(),
    host: '127.0.0.1',
    tls,
    statePath: join(root, 'node-state.json'),
    peerRecordAutoRenew: false
  });
  try {
    await node.start();
    const peers = [remoteRecord(65521), remoteRecord(65522)];
    const announced = [];
    node.rpc.announce = async (peer, record) => {
      announced.push({ peerNodeId: peer.nodeId, recordId: record.recordId, sequence: record.sequence });
      return { accepted: true, nodeId: record.nodeId, sequence: record.sequence };
    };

    node.bootstrap(peers);

    const propagation = await eventually(() => {
      const current = node.peerRecordLifecycleSnapshot().propagation;
      return current.ready && current.targetNodeIds.length === peers.length ? current : null;
    }, { message: 'bootstrap_self_record_not_propagated' });

    assert.equal(node.peerRecordPropagationReady(), true);
    assert.deepEqual(propagation.pendingNodeIds, []);
    assert.deepEqual(propagation.targetNodeIds, peers.map((peer) => peer.nodeId).sort());
    assert.deepEqual(propagation.acknowledgedNodeIds, peers.map((peer) => peer.nodeId).sort());
    assert.equal(announced.length, peers.length);
    assert.ok(announced.every((entry) => entry.recordId === node.localPeerRecord.recordId));
  } finally {
    await node.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('production propagation: failed renewal placement remains not-ready until bounded control-plane retry succeeds', { timeout: 15_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-peer-propagation-renew-'));
  const tls = await generateTls(root);
  const node = new TruynNetworkNode({
    identity: createIdentity(),
    host: '127.0.0.1',
    tls,
    statePath: join(root, 'node-state.json'),
    peerRecordTtlMs: 60_000,
    peerRecordAutoRenew: false
  });
  try {
    const initial = await node.start();
    const stable = remoteRecord(65523);
    const flaky = remoteRecord(65524);
    const attempts = new Map();
    node.rpc.announce = async (peer, record) => {
      const key = `${record.sequence}:${peer.nodeId}`;
      const count = (attempts.get(key) || 0) + 1;
      attempts.set(key, count);
      if (record.sequence > initial.sequence && peer.nodeId === flaky.nodeId && count === 1) {
        throw new Error('simulated_partitioned_peer');
      }
      return { accepted: true, nodeId: record.nodeId, sequence: record.sequence };
    };

    node.bootstrap([stable, flaky]);
    await eventually(() => node.peerRecordPropagationReady(), { message: 'initial_self_record_not_ready' });

    const renewed = await node.renewPeerRecord();
    assert.ok(renewed.record.sequence > initial.sequence);
    assert.equal(renewed.announcement.failed, 1);
    assert.equal(node.peerRecordPropagationReady(), false);

    const pending = node.peerRecordLifecycleSnapshot().propagation;
    assert.deepEqual(pending.pendingNodeIds, [flaky.nodeId]);
    assert.ok(pending.acknowledgedNodeIds.includes(stable.nodeId));

    const repaired = await eventually(() => {
      const current = node.peerRecordLifecycleSnapshot().propagation;
      return current.recordId === renewed.record.recordId && current.ready ? current : null;
    }, { timeoutMs: 4_000, message: 'renewal_propagation_retry_did_not_recover' });

    assert.equal(attempts.get(`${renewed.record.sequence}:${stable.nodeId}`), 1, 'already acknowledged placement must not be retried');
    assert.equal(attempts.get(`${renewed.record.sequence}:${flaky.nodeId}`), 2, 'failed placement gets one bounded retry before readiness');
    assert.deepEqual(repaired.pendingNodeIds, []);
    assert.equal(node.localPeerRecord.recordId, renewed.record.recordId, 'control-plane retry must not mint another record or application envelope');
  } finally {
    await node.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('production propagation: target-set churn preserves ACK intersection and coalesces a synchronous reconciliation burst', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-peer-propagation-churn-'));
  const tls = await generateTls(root);
  const node = new TruynNetworkNode({
    identity: createIdentity(),
    host: '127.0.0.1',
    tls,
    statePath: join(root, 'node-state.json'),
    k: 3,
    peerRecordAutoRenew: false
  });
  try {
    await node.start();
    node.rpc.announce = async (peer, record) => ({
      accepted: true,
      nodeId: record.nodeId,
      peerNodeId: peer.nodeId,
      sequence: record.sequence
    });

    node.bootstrap([remoteRecord(65601), remoteRecord(65602), remoteRecord(65603)]);
    await eventually(() => node.peerRecordPropagationReady(), { message: 'initial_churn_fixture_not_ready' });

    const baselineRecovery = node.peerRecordLifecycleSnapshot().recovery;
    let observed = null;
    let port = 65604;
    for (; port < 65720; port += 1) {
      const previous = node.peerRecordLifecycleSnapshot().propagation;
      node.bootstrap([remoteRecord(port)]);
      const current = node.peerRecordLifecycleSnapshot().propagation;
      if (current.targetNodeIds.join(',') === previous.targetNodeIds.join(',')) continue;
      const intersection = previous.acknowledgedNodeIds.filter((nodeId) => current.targetNodeIds.includes(nodeId));
      if (intersection.length === 0) continue;
      observed = { current, intersection };
      break;
    }

    assert.ok(observed, 'fixture must produce a placement replacement with a non-empty ACK intersection');
    assert.ok(observed.intersection.every((nodeId) => observed.current.acknowledgedNodeIds.includes(nodeId)),
      'ACKs for placements that remain required must survive same-record target-set churn');
    assert.ok(observed.current.pendingNodeIds.length > 0,
      'newly required placement must keep readiness closed until its own ACK arrives');
    assert.equal(node.peerRecordPropagationReady(), false, 'target churn closes readiness synchronously');

    // Keep adding records synchronously inside the same short reconciliation window.
    // The network should publish the final placement, not one RPC wave per accepted record.
    for (let extra = 0; extra < 32; extra += 1) node.bootstrap([remoteRecord(port + 1 + extra)]);

    const stagedRecovery = node.peerRecordLifecycleSnapshot().recovery;
    assert.equal(stagedRecovery.ackReset, baselineRecovery.ackReset,
      'same signed record target churn must not reset already valid ACKs');
    assert.ok(stagedRecovery.ackPreserved > baselineRecovery.ackPreserved,
      'intersection ACK preservation must be observable');
    assert.ok(stagedRecovery.targetSetChanges > baselineRecovery.targetSetChanges,
      'target-set changes must be counted');

    await eventually(() => node.peerRecordPropagationReady(), { message: 'coalesced_churn_did_not_recover' });
    const recovered = node.peerRecordLifecycleSnapshot().recovery;
    const targetChangeDelta = recovered.targetSetChanges - baselineRecovery.targetSetChanges;
    const batchDelta = recovered.reconcileBatches - baselineRecovery.reconcileBatches;
    assert.ok(targetChangeDelta >= 1);
    assert.ok(batchDelta <= 1,
      `synchronous target churn should coalesce into at most one network reconciliation batch; changes=${targetChangeDelta} batches=${batchDelta}`);
  } finally {
    await node.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('production propagation: retry schedule stays bounded below the unchanged 120 second Class-D recovery ceiling', async () => {
  const source = await readFile(new URL('../network/runtime.js', import.meta.url), 'utf8');
  const match = source.match(/peerRecordRecoveryRetryDelaysMs\s*=\s*\[([^\]]+)\]/);
  assert.ok(match, 'peer-record recovery retry schedule must remain explicit');
  const delays = [...match[1].matchAll(/([0-9_]+)/g)].map((entry) => Number(entry[1].replaceAll('_', '')));
  assert.deepEqual(delays, [500, 1_500, 5_000, 10_000, 20_000]);
  assert.ok(delays.reduce((sum, value) => sum + value, 0) + 5_000 < 120_000, 'bounded propagation recovery plus canonical 5s DHT RPC attempt must remain below 120s');
});
