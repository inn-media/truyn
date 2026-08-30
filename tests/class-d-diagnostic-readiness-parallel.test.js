import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 diagnostic patch fans readiness probes out across all hosts before aggregation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-readiness-parallel-'));
  const target = join(dir, 'campaign.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-campaign.sh', target);
  const before = await readFile(target, 'utf8');
  const beforeConvergence = before.slice(before.indexOf('STAGE=convergence'));

  const run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-readiness-parallel.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const after = await readFile(target, 'utf8');
  const readinessStart = after.indexOf('STAGE=readiness-barrier');
  const convergenceStart = after.indexOf('STAGE=convergence');
  assert.ok(readinessStart >= 0 && convergenceStart > readinessStart, 'expected bounded readiness block');
  const block = after.slice(readinessStart, convergenceStart);

  const launchLine = '(remote "${VMS[$i]}" "$script" >"$readiness_dir/$i") &';
  const aggregateLine = 'out="$(cat "$readiness_dir/$i")"';

  assert.ok(block.includes('readiness_dir=$(mktemp -d)'), 'expected temp directory for host outputs');
  assert.ok(block.includes('readiness_pids=()'), 'expected PID collection');
  assert.ok(block.includes(launchLine), 'expected background remote launch per host');
  assert.ok(block.includes('readiness_pids+=("$!")'), 'expected PID capture');
  assert.ok(block.includes('for pid in "${readiness_pids[@]}"; do'), 'expected wait loop after fan-out');
  assert.ok(block.includes('if ! wait "$pid"; then readiness_failed=1; fi'), 'expected fail-closed wait aggregation');
  assert.ok(block.includes(aggregateLine), 'expected file-backed aggregation');
  assert.ok(block.includes('stage=readiness-barrier host=$i mode=parallel-hosts'), 'expected parallel mode marker');

  const launchIndex = block.indexOf(launchLine);
  const waitIndex = block.indexOf('for pid in "${readiness_pids[@]}"; do');
  const aggregateIndex = block.indexOf(aggregateLine);
  assert.ok(waitIndex > launchIndex, 'expected wait only after all background launches');
  assert.ok(aggregateIndex > waitIndex, 'expected aggregation only after wait');
  assert.equal(block.slice(0, waitIndex).includes('out=$(remote "${VMS[$i]}" "$script")'), false);

  assert.ok(block.includes('deadline=\\$((\\$(date +%s) + 120))'), 'readiness deadline must remain 120 seconds');
  assert.ok(block.includes('"\\$valid" -ge ${BOOTSTRAP_MAX_PEERS_PER_NODE}'), 'peer bound must remain unchanged');
  assert.ok(block.includes('"\\$buckets" -gt 0'), 'bucket readiness predicate must remain unchanged');
  assert.ok(block.includes('"\\$hosts" -ge 2'), 'remote-host diversity predicate must remain unchanged');
  assert.ok(block.includes('[[ "$readiness_ready" == "$NODE_COUNT" ]]'), 'all nodes must still pass readiness');

  assert.equal(after.slice(after.indexOf('STAGE=convergence')), beforeConvergence, 'stages after readiness must remain byte-identical');

  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-readiness-parallel.py', target], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'patch must fail closed when applied twice');
});
