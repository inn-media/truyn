import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (file) => fs.readFileSync(file, 'utf8');

test('D-Series architecture lock is frozen-candidate admission v2 until all D-Series tests complete', () => {
  const lock = JSON.parse(read('config/d-series-swarm-blockwise-architecture-lock.json'));
  assert.equal(lock.schema, 'truyn.d-series.swarm-blockwise-architecture-lock.v2');
  assert.equal(lock.state, 'LOCKED');
  assert.equal(lock.effectiveUntil, 'ALL_D_SERIES_TESTS_COMPLETE');
  assert.equal(lock.primaryEngine, 'sanitation-swarm');
  assert.equal(lock.subordinateAdmissionGate, 'blockwise-b01-b16');
  assert.equal(lock.integrationAdmissionGate, 'frozen-candidate-admission-to-main');
  for (const key of [
    'frozenQualificationIndependentOfMovingMain',
    'mainMovementTriggersAdmissionNotAutomaticFullRerun',
    'baseToCurrentMainDiffIsMandatory',
    'integrationFingerprintsAreMandatory',
    'unaffectedFrozenEvidenceRemainsValid',
    'onlyAffectedBlocksRequalify',
    'oldGreenCandidateNeverAuthorizesMergeByItself',
    'freshAdmissionRequiredBeforeMergeOrLaunch',
    'admissionStaleAfterMainMovement',
    'liveRerunOnlyWhenProvenNecessary',
    'acceptanceThresholdWeakeningForbidden',
    'silentArchitectureReplacementForbidden'
  ]) assert.equal(lock.invariants[key], true, key);
  const verification = spawnSync(process.execPath, ['scripts/verify-d-series-swarm-blockwise-architecture-lock.mjs'], { encoding: 'utf8' });
  assert.equal(verification.status, 0, verification.stderr || verification.stdout);
  assert.match(verification.stdout, /TRUYN_D_SERIES_ARCHITECTURE_LOCK=PASS/);
});

test('Sanitation Swarm remains the primary diagnostic engine', () => {
  const workflow = read('.github/workflows/d200-bug-hunt.yml');
  for (const marker of [
    'name: D-Series Sanitation Swarm',
    'scripts/class-d-stage-runner.mjs',
    'scripts/d-series-block-runner.mjs',
    'fail-fast: false',
    'd-series-swarm-aggregate.mjs'
  ]) assert.ok(workflow.includes(marker), `Swarm workflow lost marker: ${marker}`);
});

test('frozen candidate qualification is deliberately independent of moving main', () => {
  const workflow = read('.github/workflows/d-series-frozen-candidate-qualification.yml');
  for (const marker of [
    'name: D-Series Frozen Candidate Qualification',
    'base_sha:',
    'candidate_sha:',
    'current_main_is_irrelevant=true',
    'scripts/class-d-stage-runner.mjs',
    'scripts/d-series-block-runner.mjs',
    'scripts/d-series-swarm-aggregate.mjs',
    'scripts/d-series-block-aggregate.mjs',
    'scripts/d-series-qualification-manifest.mjs',
    'd-series-qualification-${{ github.run_id }}'
  ]) assert.ok(workflow.includes(marker), `frozen qualification lost marker: ${marker}`);
  assert.ok(!workflow.includes('[[ "$main_sha" == "$CANDIDATE_SHA" ]]'));
});

test('Admission Gate compares BASE_SHA to current main and recalculates integration fingerprints', () => {
  const workflow = read('.github/workflows/d-series-admission-gate.yml');
  const planner = read('scripts/d-series-admission-plan.mjs');
  for (const marker of [
    'name: D-Series Admission Gate',
    'qualification_run_id:',
    'scripts/d-series-admission-plan.mjs',
    'affected_matrix',
    'REQUALIFY_AFFECTED_BLOCKS',
    'git merge --no-commit --no-ff',
    'git write-tree',
    'ADMIT_AFTER_TARGETED_REQUALIFICATION',
    'Admission stale: main moved; rerun Admission Gate only, never full D qualification automatically.'
  ]) assert.ok(workflow.includes(marker), `Admission workflow lost marker: ${marker}`);
  for (const marker of [
    "git('diff', '--name-only', `${baseSha}..${currentMainSha}`)",
    "git('merge-tree', '--write-tree', currentMainSha, candidateSha)",
    'frozenCandidateSha256',
    'integrationSha256',
    'automaticFullRerunForbidden: true',
    "liveDRunDecision: affectedBlocks.length ? 'DEFER_UNTIL_AFFECTED_BLOCKS_REQUALIFIED' : 'NOT_REQUIRED_BY_MAIN_MOVEMENT'"
  ]) assert.ok(planner.includes(marker), `Admission planner lost marker: ${marker}`);
});

test('fresh Admission provenance becomes stale immediately when main moves', () => {
  const verifier = read('scripts/verify-d-series-admission-run.sh');
  for (const marker of [
    'D-Series Admission Gate',
    'd-series-admission-${RUN_ID}',
    'currentMainSha == $main',
    'ADMIT_WITH_FROZEN_EVIDENCE',
    'ADMIT_AFTER_TARGETED_REQUALIFICATION',
    'stale_or_invalid_final_plan'
  ]) assert.ok(verifier.includes(marker), `Admission verifier lost marker: ${marker}`);
});

test('frozen admission policy maps every B01-B16 block and forbids automatic full rerun on main movement', () => {
  const policy = JSON.parse(read('config/d-series-frozen-candidate-admission.json'));
  assert.equal(policy.state, 'LOCKED');
  assert.equal(policy.model, 'FROZEN_CANDIDATE_BRANCH_QUALIFICATION_ADMISSION_TO_MAIN');
  assert.equal(policy.rules.mainMovementTriggersAdmissionAnalysisNotAutomaticFullRerun, true);
  assert.equal(policy.rules.oldGreenBranchShaAloneNeverAuthorizesMerge, true);
  assert.equal(policy.rules.affectedBlocksMustPassOnIntegrationStateBeforeAdmission, true);
  const blocks = new Set(policy.surfaces.flatMap((surface) => surface.blocks));
  for (let i = 1; i <= 16; i += 1) assert.ok(blocks.has(`B${String(i).padStart(2, '0')}`));
  const verification = spawnSync(process.execPath, ['scripts/check-d-series-frozen-candidate-admission.mjs'], { encoding: 'utf8' });
  assert.equal(verification.status, 0, verification.stderr || verification.stdout);
});

test('legacy exact-main transports may remain but no longer define the D-Series merge authority', () => {
  const blockwise = read('.github/workflows/d-series-blockwise-preflight.yml');
  const swarmCaller = read('.github/workflows/d-series-swarm-one-shot-launcher.yml');
  assert.ok(blockwise.includes('D-Series Blockwise Preflight'));
  assert.ok(swarmCaller.includes('D-Series Swarm One-Shot Launcher'));
  const docs = read('docs/operations/class-d/D_SERIES_FROZEN_CANDIDATE_ADMISSION.md');
  assert.ok(docs.includes('A GREEN frozen candidate SHA alone can never authorize merge or launch.'));
  assert.ok(docs.includes('main` movement after this point does not erase this evidence'));
});
