import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Class-D restart recovery invariants cannot be silently removed or weakened', () => {
  const run = spawnSync(process.execPath, ['scripts/check-class-d-recovery-invariants.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(run.status, 0, `recovery invariant checker failed\nstdout=${run.stdout}\nstderr=${run.stderr}`);
  assert.match(run.stdout, /TRUYN_CLASS_D_RECOVERY_INVARIANTS=PASS/);
  assert.match(run.stdout, /recovery_p95_max_ms=120000/);
  assert.match(run.stdout, /diagnostics=8/);
  assert.match(run.stdout, /fail_closed=true/);
  assert.match(run.stdout, /direct_quic=true/);
  assert.match(run.stdout, /no_silent_removal=true/);
});
