import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 collects all host/node readiness observations before failing the strict 20-host gate', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-readiness-evidence-'));
  const target = join(dir, 'campaign.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-campaign.sh', target);
  const before = await readFile(target, 'utf8');
  const afterReadiness = before.slice(before.indexOf('STAGE=convergence'));

  for (const patch of [
    'scripts/patch-class-d-diagnostic-readiness-parallel.py',
    'scripts/patch-class-d-diagnostic-readiness-window.py',
    'scripts/patch-class-d-diagnostic-readiness-evidence.py'
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

  assert.ok(block.includes('D200_READINESS_EVIDENCE_V2=1'));
  assert.equal(block.split('deadline=\\$((\\$(date +%s) + 120))').length - 1, 1);
  assert.ok(block.includes('"\\$hosts" -eq ${HOST_COUNT}'));
  assert.ok(block.includes('"\\$valid" -ge ${BOOTSTRAP_MAX_PEERS_PER_NODE}'));
  assert.equal(block.includes('/need'), false);

  assert.ok(block.includes('READINESS_NODE_OBSERVATIONS_B64='));
  assert.ok(block.includes('readiness_observations_dir=\\$(mktemp -d)'));
  assert.ok(block.includes('missingHostIndexes'));
  assert.ok(block.includes('oldestPeerRecordIssuedAt'));
  assert.ok(block.includes('nearestPeerRecordExpiryMs'));
  assert.ok(block.includes('expiredPeerRecords'));
  assert.ok(block.includes('peerRecordSequence'));
  assert.ok(block.includes('periodicRefreshLastResult'));
  assert.ok(block.includes('targetCount'));
  assert.ok(block.includes('acknowledgedCount'));
  assert.ok(block.includes('pendingCount'));

  const failedFlag = block.indexOf('readiness_gate_failed=1');
  const aggregatePath = block.indexOf('class-d-200-readiness-node-observations.json');
  const aggregateFailure = block.indexOf('TRUYN_D200_READINESS_AGGREGATE_FAILURE');
  assert.ok(failedFlag >= 0 && aggregatePath > failedFlag && aggregateFailure > aggregatePath, 'strict failure must happen after observation aggregation');
  assert.equal(block.includes('rm -rf "$readiness_dir"\n    false'), false, 'first failing host must not abort aggregation');
  assert.ok(block.includes('TRUYN_D200_READINESS_NODE_FAILURE host=$i observation=$row'));
  assert.ok(block.includes('expectedHostCount:$expectedHosts'));
  assert.ok(block.includes('expectedNodeCount:$expectedNodes'));
  assert.ok(block.includes('observations:(add | sort_by(.hostIndex,.nodeIndex))'));
  assert.ok(block.includes('readiness_ready=$((readiness_ready+ready))'), 'actual ready count must still aggregate failed hosts');
  assert.ok(block.includes('if [[ "$min_hosts" -lt "$readiness_min_hosts" ]]'), 'actual host-diversity minima must survive failure');

  assert.equal(value.slice(value.indexOf('STAGE=convergence')), afterReadiness, 'later acceptance stages must remain byte-identical');

  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-readiness-evidence.py', target], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'readiness evidence patch must fail closed when applied twice');
});
