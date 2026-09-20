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
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`openssl failed: ${run.stderr}`);
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

function waitFor(predicate, timeoutMs = 5_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('wait_timeout'));
      setTimeout(poll, 10);
    };
    poll();
  });
}

test('D-200 mass restart: 50% peer generations changed, pending drains to zero with bounded fanout', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-d200-half-restart-'));
  const tls = await generateTls(root);
  const identity = createIdentity();
  const statePath = join(root, 'node-state.json');
  const peers = Array.from({ length: 40 }, () => createIdentity());
  const oldRecords = peers.map((peerIdentity, index) => createPeerRecord({
    identity: peerIdentity,
    endpoints: [`quic://127.0.0.1:${46000 + index}`],
    sequence: 1,
    ttlMs: 600_000,
    instanceId: `old-${index}`
  }));
  const halfRestarted = oldRecords.map((record, index) => index < oldRecords.length / 2
    ? createPeerRecord({
      identity: peers[index],
      endpoints: record.endpoints,
      sequence: 2,
      ttlMs: 600_000,
      instanceId: `new-${index}`
    })
    : record);

  const seed = new TruynNetworkNode({
    identity,
    host: '127.0.0.1',
    tls,
    statePath,
    peerRecordAutoRenew: false,
    discoveryPeriodicRefresh: false,
    peerRecordPublishFanout: 0
  });
  await seed.start();
  seed.discovery.bootstrap(halfRestarted);
  await seed.persistState();
  await seed.close();

  const restarted = new TruynNetworkNode({
    identity,
    host: '127.0.0.1',
    tls,
    statePath,
    k: 8,
    alpha: 3,
    peerRecordPublishFanout: 8,
    peerRecordAutoRenew: false,
    discoveryPeriodicRefresh: false,
    dhtRpcTimeoutMs: 500
  });

  let active = 0;
  let maxActive = 0;
  let attempts = 0;
  restarted.rpc.announce = async () => {
    attempts += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return { accepted: true };
  };

  const startedAt = Date.now();
  try {
    await restarted.start();
    const afterStart = restarted.peerRecordLifecycleSnapshot().propagation;
    assert.equal(afterStart.ready, true, 'required Kademlia placement must ACK before start returns');
    assert.equal(afterStart.pendingNodeIds.length, 0, 'required readiness pending set must drain to zero');
    assert.ok(afterStart.targetNodeIds.length <= 8, `required readiness targets must remain bounded, got ${afterStart.targetNodeIds.length}`);
    assert.ok(Date.now() - startedAt < 120_000, 'recovery must stay inside the unchanged 120s acceptance bound');

    await waitFor(() => attempts >= halfRestarted.length, 5_000);
    assert.ok(maxActive <= 3, `announcement concurrency must stay <= alpha=3, observed ${maxActive}`);
    assert.equal(attempts, halfRestarted.length, 'required + background lanes should announce each recovered peer once when all ACK');

    const finalPropagation = restarted.peerRecordLifecycleSnapshot().propagation;
    assert.deepEqual(finalPropagation.targetNodeIds, afterStart.targetNodeIds, 'background dissemination must not expand readiness targets');
    assert.equal(finalPropagation.pendingNodeIds.length, 0);
    assert.equal(restarted.peerRecordPropagationReady(), true);
  } finally {
    await restarted.close().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
