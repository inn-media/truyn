import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('diagnostic bootstrap patch changes only refresh execution timeout', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-diagnostic-bootstrap-timeout-'));
  const target = join(dir, 'provision.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-provision.sh', target);
  const before = await readFile(target, 'utf8');

  const run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-bootstrap-timeout.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);

  const after = await readFile(target, 'utf8');
  assert.match(before, /refresh_result=\\\$\(curl -fsS --max-time 120 .*\/dht\/refresh/);
  assert.match(after, /refresh_result=\\\$\(curl -fsS --max-time 300 .*\/dht\/refresh/);
  assert.doesNotMatch(after, /refresh_result=\\\$\(curl -fsS --max-time 120 .*\/dht\/refresh/);

  const normalized = after.replace('--max-time 300', '--max-time 120');
  assert.equal(normalized, before, 'diagnostic patch must not alter routing, safety, or strict D-1000 semantics');
});
