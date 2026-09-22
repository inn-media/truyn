import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIdentity } from '../core/identity/index.js';
import { TruynNetworkNode } from '../network/runtime.js';

async function generateTls(root) {
  const keyPath = join(root, 'key.pem');
  const certPath = join(root, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`openssl failed: ${run.stderr}`);
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('D-500: a copy of a peer record survives the owner lease boundary without a direct renewal announce', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-d500-lease-'));
  const tls = await generateTls(root);
  // B renews but announces to nobody (fanout 0): exactly the position of every non-placement node.
  const a = new TruynNetworkNode({ identity: createIdentity(), host: '127.0.0.1', tls, peerRecordTtlMs: 3_000, peerRecordAutoRenew: false, discoveryPeriodicRefresh: false });
  const b = new TruynNetworkNode({ identity: createIdentity(), host: '127.0.0.1', tls, peerRecordTtlMs: 3_000, peerRecordPublishFanout: 0, discoveryPeriodicRefresh: false });
  try {
    const [, rb] = await Promise.all([a.start(), b.start()]);
    a.bootstrap([rb]);
    await sleep(Date.parse(rb.expiresAt) - Date.now() + 800);
    const copy = a.discovery.get(b.identity.nodeId);
    assert.ok(copy, 'copy of B expired at A: validPeers collapses network-wide at the first lease boundary');
    assert.ok(copy.sequence > rb.sequence);
  } finally {
    await Promise.allSettled([a.close(), b.close()]);
    await rm(root, { recursive: true, force: true });
  }
});

test('D-500: lookup reaches a target whose only known record is lease-expired (signed hint, fresh self-record)', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-d500-hint-'));
  const tls = await generateTls(root);
  const opts = { host: '127.0.0.1', tls, peerRecordTtlMs: 60_000, peerRecordAutoRenew: false, discoveryPeriodicRefresh: false };
  const a = new TruynNetworkNode({ identity: createIdentity(), ...opts });
  const b = new TruynNetworkNode({ identity: createIdentity(), ...opts });
  const c = new TruynNetworkNode({ identity: createIdentity(), ...opts, peerRecordTtlMs: 1_500 });
  try {
    const [ra, rb, rc] = await Promise.all([a.start(), b.start(), c.start()]);
    a.bootstrap([rb]); b.bootstrap([ra, rc]); c.bootstrap([rb]);
    c.onEnvelope(async () => ({ ok: true }));
    await sleep(Date.parse(rc.expiresAt) - Date.now() + 200);
    c.refreshPeerRecord();                       // C is alive with a fresh record nobody else has
    assert.equal(b.discovery.get(c.identity.nodeId), null, 'B only holds an expired copy of C');
    assert.equal(a.discovery.get(c.identity.nodeId), null, 'A has never seen C');
    const result = await a.need(c.identity.nodeId, 'probe', {}, {}, { allowRelayFallback: false });
    assert.equal(result.transport, 'quic-direct');
    assert.ok(a.discovery.get(c.identity.nodeId)?.sequence > rc.sequence, 'A learned C’s current record from C itself');
  } finally {
    await Promise.allSettled([a.close(), b.close(), c.close()]);
    await rm(root, { recursive: true, force: true });
  }
});

test('D-500: record ingested inside an expired lookup deadline does not poison later propagation RPCs', { timeout: 20_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-d500-als-'));
  const tls = await generateTls(root);
  const opts = { host: '127.0.0.1', tls, peerRecordAutoRenew: false, discoveryPeriodicRefresh: false };
  const a = new TruynNetworkNode({ identity: createIdentity(), ...opts });
  const b = new TruynNetworkNode({ identity: createIdentity(), ...opts });
  try {
    const [, rb] = await Promise.all([a.start(), b.start()]);
    // Ingest B inside a lookup deadline that expires almost immediately (as a router lookup would).
    await a.rpc.withDeadline(Date.now() + 5, async () => { a.discovery.ingest(rb); });
    await sleep(50);
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && !a.peerRecordPropagationReady()) await sleep(50);
    assert.equal(a.peerRecordPropagationReady(), true, 'placement announce to B must not run under the expired lookup deadline');
  } finally {
    await Promise.allSettled([a.close(), b.close()]);
    await rm(root, { recursive: true, force: true });
  }
});
