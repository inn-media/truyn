import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('D-200 qualification covers and executes the composed acceptance surface before Azure', async () => {
  const script = await readFile('scripts/class-d-200-preflight-qualification.sh', 'utf8');
  for (const required of [
    'patch-class-d-diagnostic-readiness-parallel.py',
    'patch-class-d-diagnostic-readiness-window.py',
    'patch-class-d-diagnostic-baseline-parallel.py',
    'patch-class-d-diagnostic-restart-parallel.py',
    'patch-class-d-diagnostic-post-restart-origin.py',
    'patch-class-d-diagnostic-composed-heal-evidence.py',
    "s.count('seq 10 14') != 3",
    "s.count('range(10,15)') != 1",
    ".replace('seq 10 14','seq 5 9')",
    ".replace('range(10,15)','range(5,10)')",
    'unset NODE_TEST_CONTEXT',
    'tests/peer-record-restart-propagation-readiness.test.js',
    'tests/dht-replication-keyspace.test.js',
    'TRUYN_D200_PREFLIGHT_QUALIFICATION=PASS',
    "assert float('$post_rate') >= .99",
    "assert float('$recovery_p95') <= 120000",
    "assert float('$healed_rate') >= .99",
    "assert float('$conv_p95') <= 120000",
  ]) assert.ok(script.includes(required), `missing qualification invariant: ${required}`);
  assert.ok(script.includes('TRUYN_D200_QUALIFICATION_REPEATS:-5'), 'race-sensitive checks must repeat before Azure');

  const env = { ...process.env, TRUYN_D200_QUALIFICATION_REPEATS: '3' };
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync('bash', ['scripts/class-d-200-preflight-qualification.sh'], {
    encoding: 'utf8',
    env,
    timeout: 120_000,
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /TRUYN_D200_PREFLIGHT_QUALIFICATION=PASS/);
});
