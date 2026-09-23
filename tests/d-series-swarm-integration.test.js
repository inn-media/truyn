import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (file) => fs.readFileSync(file, 'utf8');

test('D-Series Swarm-Blockwise architecture lock remains active until all D-Series tests complete', () => {
  const lock = JSON.parse(read('config/d-series-swarm-blockwise-architecture-lock.json'));
  assert.equal(lock.schema, 'truyn.d-series.swarm-blockwise-architecture-lock.v1');
  assert.equal(lock.state, 'LOCKED');
  assert.equal(lock.effectiveUntil, 'ALL_D_SERIES_TESTS_COMPLETE');
  assert.equal(lock.primaryEngine, 'sanitation-swarm');
  assert.equal(lock.subordinateAdmissionGate, 'blockwise-b01-b16');
  assert.equal(lock.priorityOnConflict, 'sanitation-swarm');
  assert.equal(lock.invariants.swarmOwnsDiagnosticsAndRepair, true);
  assert.equal(lock.invariants.blockwiseMayNotReplaceSwarm, true);
  assert.equal(lock.invariants.fullBlockwiseRequiresCleanExactShaSwarm, true);
  assert.equal(lock.invariants.targetedBlockGreenIsNotLaunchAuthorization, true);
  assert.equal(lock.invariants.realScaleRunRequiresAdmission, true);
  assert.equal(lock.invariants.realScaleRunIsSingleShot, true);
  assert.equal(lock.invariants.acceptanceThresholdWeakeningForbidden, true);
  assert.equal(lock.invariants.silentArchitectureReplacementForbidden, true);

  const verification = spawnSync(process.execPath, ['scripts/verify-d-series-swarm-blockwise-architecture-lock.mjs'], {
    encoding: 'utf8'
  });
  assert.equal(verification.status, 0, verification.stderr || verification.stdout);
  assert.match(verification.stdout, /TRUYN_D_SERIES_ARCHITECTURE_LOCK=PASS/);
});

test('Sanitation Swarm remains the primary D-Series engine and consumes Blockwise domains', () => {
  const workflow = read('.github/workflows/d200-bug-hunt.yml');
  const docs = read('docs/operations/class-d/D_SERIES_SANITATION_SWARM.md');
  for (const marker of [
    'name: D-Series Sanitation Swarm',
    'workflow_call:',
    'scripts/class-d-stage-runner.mjs',
    'scripts/d-series-block-runner.mjs',
    'fail-fast: false',
    'd-series-swarm-aggregate.mjs',
    'd200-bug-hunt-aggregate.mjs'
  ]) assert.ok(workflow.includes(marker), `Swarm workflow lost marker: ${marker}`);
  assert.ok(docs.includes('Sanitation / Swarm is the primary D-Series diagnostic and repair engine'));
  assert.ok(docs.includes('Blockwise B01-B16 is subordinate to it'));
  assert.ok(docs.includes('LOCKED until `ALL_D_SERIES_TESTS_COMPLETE`'));
  assert.ok(docs.includes('competing `blockwise-only` or launcher-direct architecture is forbidden'));
});

test('full Blockwise admission is impossible without exact-SHA GREEN Swarm provenance', () => {
  const workflow = read('.github/workflows/d-series-blockwise-preflight.yml');
  const verifier = read('scripts/verify-d-series-blockwise-preflight-run.sh');
  for (const marker of [
    'swarm_run_id:',
    'Require clean Swarm before full admission',
    'scripts/verify-d-series-swarm-run.sh',
    'd-series-blockwise-admission-${{ github.run_id }}'
  ]) assert.ok(workflow.includes(marker), `Blockwise admission lost marker: ${marker}`);
  assert.ok(!workflow.includes('push:\n    branches: [main]'), 'Blockwise must not race Swarm as an automatic main push admission');
  assert.ok(verifier.includes('.event == "workflow_dispatch"'));
  assert.ok(verifier.includes('d-series-blockwise-admission-${RUN_ID}'));
  assert.ok(verifier.includes('swarm_provenance=true'));
});

test('canonical one-shot caller invokes only the reusable Swarm and preserves exact-main provenance', () => {
  const launcher = read('.github/workflows/d-series-swarm-one-shot-launcher.yml');
  for (const marker of [
    'name: D-Series Swarm One-Shot Launcher',
    "- 'automation/d-series-dispatch/**'",
    "- '.github/d-series-dispatch/request.env'",
    'git rev-parse HEAD^',
    'git rev-list --count',
    'git diff --name-only',
    'uses: ./.github/workflows/d200-bug-hunt.yml',
    'source_sha: ${{ needs.plan.outputs.source_sha }}',
    'resume_across_sha: false'
  ]) assert.ok(launcher.includes(marker), `canonical Swarm caller lost marker: ${marker}`);
  assert.ok(!launcher.includes('gh workflow run'), 'canonical caller must not recursively dispatch another workflow');
  assert.ok(!launcher.includes('d-series-blockwise-preflight.yml'), 'canonical caller must not bypass the Swarm-to-Blockwise boundary');
  assert.ok(!launcher.includes('d500-acceptance'), 'canonical caller must not launch a real D-500 campaign');
});

test('real D-500 and D-1000 acceptance surfaces remain downstream of Blockwise admission', () => {
  const d500 = read('.github/d500/d500-acceptance.template.yml');
  const d1000 = read('scripts/class-d-1000-final-acceptance.sh');
  for (const surface of [d500, d1000]) {
    assert.ok(surface.includes('verify-d-series-blockwise-preflight-run.sh'), 'real D-Series acceptance surface bypassed Blockwise admission');
  }
});

test('Swarm verifier binds admission evidence to exact main, requested scale, and canonical caller provenance', () => {
  const verifier = read('scripts/verify-d-series-swarm-run.sh');
  for (const marker of [
    '.name == "D-Series Sanitation Swarm"',
    '.path == ".github/workflows/d200-bug-hunt.yml"',
    '.head_branch == "main"',
    '.head_sha == $source',
    '.event == "workflow_dispatch"',
    'D-Series Swarm One-Shot Launcher',
    'd-series-swarm-one-shot-launcher.yml',
    'caller_parent_not_exact_main',
    'caller_delta_not_single_request',
    'caller_request_mismatch',
    'd-series-swarm-summary-${EXPECTED_SCALE}-${RUN_ID}',
    'd-series-swarm-summary-all-${RUN_ID}'
  ]) assert.ok(verifier.includes(marker), `Swarm verifier lost marker: ${marker}`);
});

test('Swarm aggregate is fail-closed and deduplicates failure fingerprints', () => {
  const aggregate = read('scripts/d-series-swarm-aggregate.mjs');
  for (const marker of [
    "schema: 'truyn.d-series.sanitation-swarm.v1'",
    'rootCauseCount',
    'rootCauses',
    "primaryEngine: 'sanitation-swarm'",
    'if (enforce && !clean) process.exitCode = 1'
  ]) assert.ok(aggregate.includes(marker), `Swarm aggregate lost marker: ${marker}`);
});
