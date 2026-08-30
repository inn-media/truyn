import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 diagnostic patch fans baseline routing probes out across all hosts before aggregation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-baseline-parallel-'));
  const target = join(dir, 'campaign.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-campaign.sh', target);
  const before = await readFile(target, 'utf8');
  const invalidSignedStartBefore = before.slice(before.indexOf('STAGE=invalid-signed-state'));

  const run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-baseline-parallel.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const after = await readFile(target, 'utf8');
  const baselineStart = after.indexOf('STAGE=baseline-routing');
  const invalidSignedStart = after.indexOf('STAGE=invalid-signed-state');
  assert.ok(baselineStart >= 0 && invalidSignedStart > baselineStart, 'expected bounded baseline block');
  const block = after.slice(baselineStart, invalidSignedStart);

  const launchLine = '(remote "${VMS[$i]}" "$script" >"$baseline_dir/$i") &';
  const aggregateLine = 'out="$(cat "$baseline_dir/$i")"';

  assert.ok(block.includes('baseline_dir=$(mktemp -d)'), 'expected temp directory for host outputs');
  assert.ok(block.includes('baseline_pids=()'), 'expected PID collection');
  assert.ok(block.includes(launchLine), 'expected background remote launch per host');
  assert.ok(block.includes('baseline_pids+=("$!")'), 'expected PID capture');
  assert.ok(block.includes('for pid in "${baseline_pids[@]}"; do'), 'expected wait loop after fan-out');
  assert.ok(block.includes('if ! wait "$pid"; then baseline_failed=1; fi'), 'expected fail-closed wait aggregation');
  assert.ok(block.includes(aggregateLine), 'expected file-backed aggregation');
  assert.ok(block.includes('stage=baseline host=$i mode=parallel-hosts'), 'expected parallel mode marker');

  const launchIndex = block.indexOf(launchLine);
  const waitIndex = block.indexOf('for pid in "${baseline_pids[@]}"; do');
  const aggregateIndex = block.indexOf(aggregateLine);
  assert.ok(waitIndex > launchIndex, 'expected wait only after all background launches');
  assert.ok(aggregateIndex > waitIndex, 'expected aggregation only after wait');
  assert.equal(block.slice(0, waitIndex).includes('out=$(remote "${VMS[$i]}" "$script")'), false);

  assert.ok(block.includes("range(N*2)"), 'baseline probe count must remain unchanged');
  assert.ok(block.includes("'--max-time','15'"), 'per-probe timeout must remain unchanged');
  assert.ok(block.includes("assert float('$base_rate') >= .99, '$base_rate'"), 'routing threshold must remain 0.99');
  assert.equal(block.includes('retry'), false, 'baseline patch must not add retries');
  assert.equal(after.slice(after.indexOf('STAGE=invalid-signed-state')), invalidSignedStartBefore, 'stages after baseline must remain byte-identical');

  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-baseline-parallel.py', target], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'patch must fail closed when applied twice');
});
