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
  return createPeerRecord({
    identity: createIdentity(),
    endpoints: [`quic://127.0.0.1:${port}`],
    ttlMs: 60_000
  });
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function eventually(check, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(25);
  }
  assert.fail('condition_not_met');
}

test('production readiness closes synchronously when first-seen peers change required self-record placements', { timeout: 15_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-d200-propagation-barrier-'));
  const tls = await generateTls(root);
  const node = new TruynNetworkNode({
    identity: createIdentity(),
    host: '127.0.0.1',
    tls,
    statePath: join(root, 'network-state.json'),
    peerRecordAutoRenew: false
  });
  try {
    await node.start();
    const first = remoteRecord(65501);
    const second = remoteRecord(65502);
    const attempts = new Map();
    node.rpc.announce = async (peer, record) => {
      const key = `${record.recordId}:${peer.nodeId}`;
      const count = (attempts.get(key) || 0) + 1;
      attempts.set(key, count);
      if (peer.nodeId === second.nodeId && count === 1) throw new Error('simulated_pending_placement');
      return { accepted: true, nodeId: record.nodeId, sequence: record.sequence };
    };

    node.bootstrap([first]);
    assert.equal(node.peerRecordPropagationReady(), false, 'bootstrap placement change must fail readiness closed before queued publish');
    await eventually(() => node.peerRecordPropagationReady());

    node.bootstrap([second]);
    assert.equal(node.peerRecordPropagationReady(), false, 'newly discovered placement must close readiness synchronously');
    const pending = node.peerRecordLifecycleSnapshot().propagation;
    assert.ok(pending.pendingNodeIds.includes(second.nodeId));

    await eventually(() => node.peerRecordPropagationReady());
    const recovered = node.peerRecordLifecycleSnapshot().propagation;
    assert.deepEqual(recovered.pendingNodeIds, []);
    assert.ok(recovered.acknowledgedNodeIds.includes(second.nodeId));
  } finally {
    await node.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('D-1000 readiness barrier requires production peer-record propagation and preserves strict thresholds', async () => {
  const service = await readFile(new URL('../network/testnet/node-service.js', import.meta.url), 'utf8');
  const campaign = await readFile(new URL('../benchmarks/scale/class-d-azure-1000-campaign.sh', import.meta.url), 'utf8');
  const start = campaign.indexOf('STAGE=readiness-barrier');
  const end = campaign.indexOf('STAGE=convergence');
  const barrier = campaign.slice(start, end);

  assert.match(service, /acceptanceReady: propagationReady/);
  assert.match(service, /peerRecordPropagation:\s*\{/);
  assert.match(service, /ok: propagationReady/);
  assert.match(barrier, /\.acceptanceReady == true and \.peerRecordPropagation\.ready == true/);
  assert.doesNotMatch(barrier, /\/need/);
  assert.match(campaign, /assert float\('\$conv_rate'\) >= \.99/);
  assert.match(campaign, /assert float\('\$conv_p95'\) <= 120000/);
  assert.match(campaign, /assert float\('\$base_rate'\) >= \.99/);
});
