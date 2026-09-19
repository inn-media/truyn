import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIdentity } from '../core/identity/index.js';
import { PeerDiscovery, createPeerRecord } from '../network/discovery/peer-discovery.js';
import { TruynNetworkNode } from '../network/runtime.js';

async function generateTls(root) {
  const keyPath = join(root, 'key.pem');
  const certPath = join(root, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`openssl failed: ${run.stderr}`);
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}

const remote = (port) => createPeerRecord({ identity: createIdentity(), endpoints: [`quic://127.0.0.1:${port}`], ttlMs: 600_000 });

test('D-200: re-ingesting known peer records does not trigger durable persistence', () => {
  let changes = 0;
  const discovery = new PeerDiscovery({ identity: createIdentity(), onChange: () => { changes += 1; } });
  const records = Array.from({ length: 40 }, (_, i) => remote(40000 + i));
  for (const record of records) discovery.ingest(record);
  assert.equal(changes, 40);
  for (const record of records) discovery.ingest(record);
  assert.equal(changes, 40, 'unchanged hearsay (FIND_NODE responses) must not snapshot + fsync the whole state');
});

test('D-200: concurrent persistence requests are group-committed and stay fail-closed', { timeout: 15_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-d200-group-commit-'));
  const node = new TruynNetworkNode({ identity: createIdentity(), host: '127.0.0.1', tls: await generateTls(root), statePath: join(root, 's.json'), peerRecordAutoRenew: false, discoveryPeriodicRefresh: false, peerRecordPublishFanout: 0 });
  try {
    await node.start();
    await node.persistState();
    let saves = 0;
    const save = node.stateStore.save.bind(node.stateStore);
    node.stateStore.save = async (snapshot) => { saves += 1; return save(snapshot); };
    node.discovery.bootstrap(Array.from({ length: 50 }, (_, i) => remote(41000 + i)));
    const acks = await Promise.all(Array.from({ length: 50 }, () => node.persistState()));
    assert.ok(saves <= 2, `50 ACK barriers must share a save, got ${saves}`);
    assert.ok(acks.every((snapshot) => snapshot?.peerRecords?.length >= 50), 'every ACK barrier must cover state written before it');
    node.stateStore.save = async () => { throw new Error('disk_full'); };
    node.discovery.bootstrap([remote(42000)]);
    await assert.rejects(node.persistState(), /disk_full/, 'a failed save must fail the ACK barrier closed');
    node.stateStore.save = save;
  } finally {
    await node.close().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test('D-200: restart readiness gates on the Kademlia placement set, not every recovered peer', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-d200-restart-gate-'));
  const tls = await generateTls(root);
  const statePath = join(root, 's.json');
  const identity = createIdentity();
  const options = { identity, host: '127.0.0.1', tls, statePath, peerRecordAutoRenew: false, discoveryPeriodicRefresh: false, dhtRpcTimeoutMs: 300 };
  const first = new TruynNetworkNode(options);
  await first.start();
  first.discovery.bootstrap(Array.from({ length: 60 }, (_, i) => remote(43000 + i)));
  await first.persistState();
  await first.close();
  const restarted = new TruynNetworkNode(options);
  try {
    restarted.rpc.announce = async () => { throw new Error('peer_restarting'); };
    await restarted.start();
    const targets = restarted.peerRecordLifecycleSnapshot().propagation.targetNodeIds;
    assert.ok(targets.length <= restarted.peerRecordPublishFanout, `readiness targets must be closest(self, fanout), got ${targets.length} of 60 recovered peers`);
    const placement = restarted.discovery.closest(identity.nodeId, restarted.peerRecordPublishFanout).map((peer) => peer.nodeId).sort();
    assert.deepEqual([...targets].sort(), placement);
  } finally {
    await restarted.close().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});

test('D-200: renewal keeps the live direct session object (no supersede race for in-flight NEEDs)', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-d200-renewal-session-'));
  const tls = await generateTls(root);
  const a = new TruynNetworkNode({ identity: createIdentity(), host: '127.0.0.1', tls, peerRecordAutoRenew: false, discoveryPeriodicRefresh: false });
  const b = new TruynNetworkNode({ identity: createIdentity(), host: '127.0.0.1', tls, peerRecordAutoRenew: false, discoveryPeriodicRefresh: false });
  try {
    const [ra, rb] = await Promise.all([a.start(), b.start()]);
    a.bootstrap([rb]);
    b.bootstrap([ra]);
    a.onEnvelope(async () => ({ ok: true }));
    await b.need(a.identity.nodeId, 'warm', {});
    const before = b.router.connections.get(a.identity.nodeId)?.client;
    assert.ok(before);
    const renewed = await a.renewPeerRecord();
    assert.ok(renewed.announcement.delivered >= 1);
    assert.ok(b.discovery.get(a.identity.nodeId).sequence > ra.sequence);
    assert.equal(b.router.connections.get(a.identity.nodeId)?.client, before, 'same-instance renewal must not discard the live session');
    const after = await b.need(a.identity.nodeId, 'after-renewal', {});
    assert.equal(after.transport, 'quic-direct');
  } finally {
    await Promise.allSettled([a.close(), b.close()]);
    await rm(root, { recursive: true, force: true });
  }
});
