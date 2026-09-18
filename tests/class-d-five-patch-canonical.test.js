import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

function run(bin, args) {
  return spawnSync(bin, args, { cwd: process.cwd(), encoding: 'utf8' });
}

test('Class D five-patch canonical checker passes for D-200 D-500 D-1000', () => {
  const result = run(process.execPath, ['scripts/check-class-d-five-patches.mjs']);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /TRUYN_CLASS_D_FIVE_PATCHES=PASS/);
});

test('canonical Class D runner and multiprocess wrapper remain syntactically valid', () => {
  for (const file of ['scripts/class-d-stage-runner.mjs','scripts/class-d-local-multiprocess-repro.mjs']) {
    const result = run(process.execPath, ['--check', file]);
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});

test('canonical manifest pins all five patches to all three scale classes', () => {
  const manifest = JSON.parse(fs.readFileSync('config/class-d-five-patches.json', 'utf8'));
  assert.deepEqual(manifest.requiredFor, ['D-200','D-500','D-1000']);
  assert.equal(manifest.patches.length, 5);
  assert.equal(manifest.policy.failClosed, true);
  assert.equal(manifest.policy.silentRemovalForbidden, true);
  assert.equal(manifest.policy.acceptanceWeakeningForbidden, true);
  assert.equal(manifest.classProfiles['D-200'].productionNodes, 200);
  assert.equal(manifest.classProfiles['D-500'].productionNodes, 500);
  assert.equal(manifest.classProfiles['D-1000'].productionNodes, 1000);
});
