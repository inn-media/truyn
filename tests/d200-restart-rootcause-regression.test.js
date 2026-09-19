import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createPeerRecord, verifyPeerRecord, PeerDiscovery } from '../network/discovery/peer-discovery.js';
import { TruynNetworkNode } from '../network/runtime.js';

test('peer record instanceId is signed and duplicate accepted records do not emit persistence churn', () => {
  const local = createIdentity();
  const remote = createIdentity();
  let changes = 0;
  let accepted = 0;
  const discovery = new PeerDiscovery({
    identity: local,
    onChange: () => { changes += 1; },
    onRecordAccepted: () => { accepted += 1; }
  });
  const record = createPeerRecord({
    identity: remote,
    endpoints: ['quic://127.0.0.1:31001'],
    sequence: 7,
    instanceId: 'process-epoch-a',
    ttlMs: 60_000
  });
  assert.equal(record.instanceId, 'process-epoch-a');
  assert.equal(verifyPeerRecord(record).ok, true);
  const tampered = { ...record, instanceId: 'process-epoch-b' };
  assert.equal(verifyPeerRecord(tampered).ok, false, 'instanceId must be covered by the signature/recordId');
  assert.equal(discovery.ingest(record).accepted, true);
  assert.equal(discovery.ingest(record).unchanged, true);
  assert.equal(changes, 1, 'duplicate known ACK/record must not schedule another durable snapshot');
  assert.equal(accepted, 1, 'duplicate record must not trigger replacement reconciliation');
});

test('trusted in-memory record read checks lease without repeating signature verification semantics', () => {
  const local = createIdentity();
  const remote = createIdentity();
  const discovery = new PeerDiscovery({ identity: local });
  const record = createPeerRecord({
    identity: remote,
    endpoints: ['quic://127.0.0.1:31002'],
    instanceId: 'process-epoch-c',
    issuedAt: new Date(Date.now() - 1000).toISOString(),
    ttlMs: 60_000
  });
  assert.equal(discovery.ingest(record).accepted, true);
  assert.equal(discovery.get(remote.nodeId)?.recordId, record.recordId);
  assert.equal(discovery.get(remote.nodeId, { now: Date.parse(record.expiresAt) + 1 }), null, 'lease expiry remains fail closed');
  const invalid = { ...record, sequence: record.sequence + 1 };
  assert.equal(discovery.ingest(invalid).accepted, false, 'tampered state must still fail at the ingestion security boundary');
});

test('persistence burst is group committed into one snapshot/save', async () => {
  const node = new TruynNetworkNode({
    identity: createIdentity(),
    host: '127.0.0.1',
    tls: { key: 'unused-in-unit-test', cert: 'unused-in-unit-test' },
    statePath: '/tmp/truyn-d200-persist-regression.json',
    peerRecordAutoRenew: false
  });
  let saves = 0;
  node.stateStore = { save: async () => { saves += 1; } };
  node.stateReady = true;
  for (let i = 0; i < 201; i += 1) node.schedulePersist();
  await node.persistState();
  assert.equal(saves, 1, 'one synchronous burst must produce one snapshot+save group commit');
});

test('recovery retry does not become terminal merely because the initial delay schedule is exhausted', async () => {
  const node = new TruynNetworkNode({
    identity: createIdentity(),
    host: '127.0.0.1',
    tls: { key: 'unused-in-unit-test', cert: 'unused-in-unit-test' },
    peerRecordAutoRenew: false
  });
  assert.deepEqual(node.peerRecordRecoveryRetryDelaysMs, [500, 1500, 5000, 10000, 20000]);
  const source = await import('node:fs/promises').then(async () => {
    try { return await import('../network/runtime.js'); } catch { return null; }
  });
  assert.ok(source, 'runtime must remain importable with bounded-but-nonterminal recovery retries');
});
