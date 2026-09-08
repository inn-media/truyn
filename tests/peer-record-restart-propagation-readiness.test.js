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

function remoteRecord(port) {
  const identity = createIdentity();
  return createPeerRecord({
    identity,
    endpoints: [`quic://127.0.0.1:${port}`],
    ttlMs: 60_000
  });
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function eventually(check, { timeoutMs = 4_000, intervalMs = 25, message = 'condition_not_met' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(intervalMs);
  }
  assert.fail(message);
}

test('durable restart is process-live before peer-record re-registration is network-ready', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-peer-restart-readiness-'));
  const tls = await generateTls(root);
  const statePath = join(root, 'network-state.json');
  const stable = remoteRecord(65531);
  const flaky = remoteRecord(65532);

  const first = new TruynNetworkNode({
    identity: createIdentity(),
    host: '127.0.0.1',
    tls,
    statePath,
    peerRecordTtlMs: 60_000,
    peerRecordAutoRenew: false
  });

  let restarted = null;
  try {
    first.rpc.announce = async () => ({ accepted: true });
    const initial = await first.start();
    first.bootstrap([stable, flaky]);
    await eventually(() => first.peerRecordPropagationReady(), { message: 'initial_peer_record_not_ready' });
    await first.persistState();
    await first.close();

    // Reuse the durable identity and network state exactly as the node runtime sees them on restart.
    const persisted = JSON.parse(await readFile(statePath, 'utf8'));

    restarted = new TruynNetworkNode({
      identity: first.identity,
      host: '127.0.0.1',
      tls,
      statePath,
      peerRecordTtlMs: 60_000,
      peerRecordAutoRenew: false
    });

    const attempts = new Map();
    restarted.rpc.announce = async (peer, record) => {
      const key = `${record.sequence}:${peer.nodeId}`;
      const count = (attempts.get(key) || 0) + 1;
      attempts.set(key, count);
      if (peer.nodeId === flaky.nodeId && count === 1) throw new Error('simulated_restart_registration_gap');
      return { accepted: true, nodeId: record.nodeId, sequence: record.sequence };
    };

    const newRecord = await restarted.start();
    assert.ok(restarted.started, 'process/QUIC startup completes');
    assert.ok(newRecord.sequence > initial.sequence, 'restart must mint a strictly newer signed peer record');
    assert.equal(persisted.nodeId, restarted.identity.nodeId);
    assert.equal(restarted.peerRecordPropagationReady(), false, 'process liveness must not imply network readiness');

    const pending = restarted.peerRecordLifecycleSnapshot().propagation;
    assert.deepEqual(pending.pendingNodeIds, [flaky.nodeId]);
    assert.ok(pending.acknowledgedNodeIds.includes(stable.nodeId));

    const recovered = await eventually(() => {
      const current = restarted.peerRecordLifecycleSnapshot().propagation;
      return current.recordId === newRecord.recordId && current.ready ? current : null;
    }, { timeoutMs: 4_000, message: 'restart_registration_retry_did_not_recover' });

    assert.equal(restarted.peerRecordPropagationReady(), true);
    assert.deepEqual(recovered.pendingNodeIds, []);
    assert.equal(attempts.get(`${newRecord.sequence}:${stable.nodeId}`), 1, 'already acknowledged placement is not retried');
    assert.equal(attempts.get(`${newRecord.sequence}:${flaky.nodeId}`), 2, 'failed restart registration is retried on the control plane only');
    assert.equal(restarted.localPeerRecord.recordId, newRecord.recordId, 'recovery retry must not mint another record or application envelope');
  } finally {
    if (restarted) await restarted.close();
    else if (first.started) await first.close();
    await rm(root, { recursive: true, force: true });
  }
});
