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

test('production propagation: retry schedule stays bounded below the unchanged 120 second Class-D recovery ceiling', async () => {
  const source = await readFile(new URL('../network/runtime.js', import.meta.url), 'utf8');
  const match = source.match(/peerRecordRecoveryRetryDelaysMs\s*=\s*\[([^\]]+)\]/);
  assert.ok(match, 'peer-record recovery retry schedule must remain explicit');
  const delays = [...match[1].matchAll(/([0-9_]+)/g)].map((entry) => Number(entry[1].replaceAll('_', '')));
  assert.deepEqual(delays, [1_000, 3_000, 10_000, 30_000, 45_000]);
  assert.ok(delays.reduce((sum, value) => sum + value, 0) + 5_000 < 120_000, 'bounded propagation recovery plus canonical 5s DHT RPC attempt must remain below 120s');
});
