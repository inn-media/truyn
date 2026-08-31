import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 diagnostic patch fans readiness probes out and recovers only persisted observations', async () => {
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

  const launchLine = '(remote "${VMS[$i]}" "$wrapped_script" >"$readiness_dir/$i") &';
  const aggregateLine = 'out="$(cat "$readiness_dir/$i")"';
  const recoveryLine = 'if recovered="$(remote "${VMS[$i]}" "set -Eeuo pipefail; cat /tmp/truyn-d200-readiness-result")"; then';

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

  assert.ok(block.includes('readiness_result_file=/tmp/truyn-d200-readiness-result'), 'expected fixed per-VM observation path');
  assert.ok(block.includes('result_tmp=\\"\\${result_file}.tmp\\"'), 'expected temporary observation file');
  assert.ok(block.includes('} | tee \\"\\$result_tmp\\"'), 'expected successful measurement output to be persisted');
  assert.ok(block.includes('mv \\"\\$result_tmp\\" \\"\\$result_file\\"'), 'expected atomic publication after successful measurement');
  assert.ok(block.includes('readiness_markers_present()'), 'expected mandatory marker validation');
  assert.ok(block.includes(recoveryLine), 'expected read-only persisted-observation recovery');
  assert.ok(block.includes('readiness_observation_missing host=$i'), 'expected explicit fail-closed missing observation marker');
  assert.ok(block.includes('stage=readiness-observation-recovery host=$i mode=read-only status=PASS'), 'expected explicit recovery telemetry');

  const recoveryStart = block.indexOf('if ! readiness_markers_present "$out"; then');
  const recoveryEnd = block.indexOf('  ready=$(marker "$out" READINESS_READY)', recoveryStart);
  assert.ok(recoveryStart >= 0 && recoveryEnd > recoveryStart, 'expected bounded recovery branch');
  const recoveryBlock = block.slice(recoveryStart, recoveryEnd);
  assert.ok(recoveryBlock.includes('cat /tmp/truyn-d200-readiness-result'), 'recovery may only read the persisted observation');
  assert.equal(recoveryBlock.includes('/dht/readiness'), false, 'recovery must not invoke readiness again');
  assert.equal(recoveryBlock.includes('deadline='), false, 'recovery must not create a second readiness window');
  assert.equal(recoveryBlock.includes('sleep 2'), false, 'recovery must not poll readiness again');
  assert.equal(recoveryBlock.includes('${script}'), false, 'recovery must not replay the readiness measurement body');

  assert.ok(block.includes('deadline=\\$((\\$(date +%s) + 120))'), 'readiness deadline must remain 120 seconds');
  assert.equal(block.split('deadline=\\$((\\$(date +%s) + 120))').length - 1, 1, 'there must be exactly one 120-second readiness window');
  assert.ok(block.includes('"\\$valid" -ge ${BOOTSTRAP_MAX_PEERS_PER_NODE}'), 'peer bound must remain unchanged');
  assert.ok(block.includes('"\\$buckets" -gt 0'), 'bucket readiness predicate must remain unchanged');
  assert.ok(block.includes('"\\$hosts" -ge 2'), 'remote-host diversity predicate must remain unchanged');
  assert.ok(block.includes('[[ "$readiness_ready" == "$NODE_COUNT" ]]'), 'all nodes must still pass readiness');

  assert.equal(after.slice(after.indexOf('STAGE=convergence')), beforeConvergence, 'stages after readiness must remain byte-identical');

  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-readiness-parallel.py', target], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'patch must fail closed when applied twice');
});
