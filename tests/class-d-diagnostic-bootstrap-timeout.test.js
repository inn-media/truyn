import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('diagnostic bootstrap patch changes only refresh transport execution policy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-diagnostic-bootstrap-timeout-'));
  const target = join(dir, 'provision.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-provision.sh', target);
  const before = await readFile(target, 'utf8');

  const run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-bootstrap-timeout.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);

  const after = await readFile(target, 'utf8');
  const original = before
    .split('\n')
    .find((line) => line.includes('refresh_result=\\$(curl -fsS --max-time 120 ') && line.includes('/dht/refresh'))
    ?.trimStart();
  assert.ok(original, 'strict provisioner refresh transport line must exist');

  assert.match(after, /for refresh_attempt in 1 2 3; do/);
  assert.ok(after.includes('refresh_result=\\$(curl -fsS --max-time 300 '), 'diagnostic refresh attempt must retain the bounded 300s transport timeout');
  assert.match(after, /TRUYN_D200_BOOTSTRAP_REFRESH_RETRY/);
  assert.equal(after.includes('refresh_result=\\$(curl -fsS --max-time 120 '), false, 'diagnostic copy must replace the strict 120s transport line');

  const start = after.indexOf("refresh_result=''");
  const endMarker = '  [[ "\\$refresh_rc" -eq 0 ]]';
  const endStart = after.indexOf(endMarker, start);
  assert.ok(start >= 0 && endStart >= 0, 'diagnostic retry block must be bounded and recognizable');
  const normalized = after.slice(0, start) + original + after.slice(endStart + endMarker.length);
  assert.equal(normalized, before, 'diagnostic patch must not alter routing, safety, evaluator, or strict D-1000 semantics');
});