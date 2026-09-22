import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('D-500 prepare preflight accepts contiguous immutable launch history through attempt 3', () => {
  const run = spawnSync('bash', ['scripts/class-d-500-preflight-qualification.sh'], {
    encoding: 'utf8',
    env: { ...process.env, D500_PREFLIGHT_PHASE: 'prepare' },
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /TRUYN_D500_PREFLIGHT_QUALIFICATION=PASS/);
  assert.match(run.stdout, /phase=prepare/);
  assert.match(run.stdout, /history_count=3/);
  assert.match(run.stdout, /launchable=false/);
});
