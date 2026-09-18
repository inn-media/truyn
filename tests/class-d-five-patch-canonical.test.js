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

test('peer-record renewal requires bounded replacement-session convergence without weakening baseline routing', () => {
  const source = fs.readFileSync('scripts/d200-local-multiprocess-repro.mjs', 'utf8');
  assert.match(source, /async function assertRouting\(nodes, label = 'routing'\)/, 'baseline routing must remain a strict dedicated assertion');
  assert.match(source, /assert\.equal\(value\.transport, 'quic-direct'/, 'routing must remain direct QUIC only');
  assert.match(source, /async function assertRoutingEventually\(nodes, label = 'routing', timeoutMs = 8000 \+ scaleExtra \* 1000\)/, 'renewal replacement session must have a bounded convergence window');
  assert.match(source, /return await eventually\(async \(\) => \{[\s\S]*?requireOk\(response, `\$\{label\} \$\{source\.index\}->\$\{target\.index\}`\)[\s\S]*?\}, timeoutMs, 150\);/, 'bounded convergence must remain fail-closed through requireOk');
  assert.match(source, /const routing = await assertRoutingEventually\(nodes, 'post-renewal-routing'\);/, 'only post-renewal routing should use replacement-session convergence');
  assert.doesNotMatch(source, /const routing = await assertRoutingEventually\(nodes, 'routing'\)/, 'ordinary routing must not be weakened to eventual success');
});
