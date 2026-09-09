import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import test from 'node:test';

test('D-200 readiness evidence transport stays bounded and lossless without weakening readiness', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-readiness-transport-'));
  const target = join(dir, 'campaign.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-campaign.sh', target);
  const before = await readFile(target, 'utf8');
  const afterReadiness = before.slice(before.indexOf('STAGE=convergence'));

  for (const patch of [
    'scripts/patch-class-d-diagnostic-readiness-parallel.py',
    'scripts/patch-class-d-diagnostic-readiness-window.py',
    'scripts/patch-class-d-diagnostic-readiness-evidence.py',
    'scripts/patch-class-d-diagnostic-readiness-transport.py'
  ]) {
    const run = spawnSync('python3', [patch, target], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  }

  const syntax = spawnSync('bash', ['-n', target], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);

  const value = await readFile(target, 'utf8');
  const start = value.indexOf('STAGE=readiness-barrier');
  const end = value.indexOf('STAGE=convergence');
  assert.ok(start >= 0 && end > start);
  const block = value.slice(start, end);

  assert.ok(block.includes('D200_READINESS_TRANSPORT_GZIP_V1=1'));
  assert.ok(block.includes('gzip -c -9 | base64 -w0'));
  assert.ok(block.includes('base64 -d | gzip -dc | jq -e'));
  assert.ok(block.includes('"\\${#readiness_node_observations_b64}" -le 3000'));
  assert.equal(block.split('deadline=\\$((\\$(date +%s) + 120))').length - 1, 1);
  assert.ok(block.includes('"\\$hosts" -eq ${HOST_COUNT}'));
  assert.ok(block.includes('"\\$valid" -ge ${BOOTSTRAP_MAX_PEERS_PER_NODE}'));
  assert.equal(block.includes('/need'), false);
  assert.equal(value.slice(value.indexOf('STAGE=convergence')), afterReadiness, 'transport repair must not modify later acceptance stages');

  const observations = Array.from({ length: 10 }, (_, nodeIndex) => ({
    nodeIndex,
    observationUnavailable: false,
    acceptanceReady: true,
    refreshStatus: 'refreshed',
    validPeers: 128 + nodeIndex,
    populatedBuckets: 8,
    remoteHostCount: 20,
    missingHostIndexes: [],
    peerRecordSequence: 2,
    oldestPeerRecordIssuedAt: '2026-09-09T06:45:32.536Z',
    nearestPeerRecordExpiryMs: 900000 + nodeIndex,
    expiredPeerRecords: 0,
    peerRecordPropagation: { ready: true, targetCount: 20, acknowledgedCount: 20, pendingCount: 0 },
    periodicRefreshLastResult: {
      refreshed: true,
      reason: null,
      targets: 20,
      nearExpiryTargets: 5,
      xorTargets: 15,
      walks: 20,
      queriedPeers: 80 + nodeIndex,
      responses: 240,
      routingSizeDelta: 0,
      validPeersDelta: nodeIndex
    }
  }));
  const json = Buffer.from(JSON.stringify(observations));
  const packed = gzipSync(json, { level: 9 }).toString('base64');
  assert.ok(packed.length <= 3000, `representative 10-node payload must fit the bounded RunCommand envelope, got ${packed.length}`);
  assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(packed, 'base64')).toString('utf8')), observations);

  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-readiness-transport.py', target], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'transport repair must fail closed when applied twice');
});
