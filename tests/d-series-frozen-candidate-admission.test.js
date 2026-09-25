import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (file) => fs.readFileSync(file, 'utf8');

test('D-Series frozen-candidate admission policy is permanently locked', () => {
  const policy = JSON.parse(read('config/d-series-frozen-candidate-policy.json'));
  assert.equal(policy.schema, 'truyn.d-series.frozen-candidate-policy.v1');
  assert.equal(policy.state, 'LOCKED');
  assert.equal(policy.effectiveUntil, 'ALL_D_SERIES_TESTS_COMPLETE');
  assert.equal(policy.model, 'Frozen Candidate -> Branch Qualification -> Admission to Main');
  for (const key of [
    'expensiveQualificationBoundToFrozenCandidate',
    'mainMovementNeverInvalidatesQualificationByItself',
    'admissionComparesBaseShaToCurrentMain',
    'noSensitiveMainDriftReusesExpensiveEvidence',
    'sensitiveMainDriftRunsOnlyAffectedBlocks',
    'automaticFullRerunOnMainMovementForbidden',
    'liveRerunOnlyWhenSensitivePolicyRequires',
    'integrationCandidateFingerprintRecomputeMandatory',
    'finalAdmissionGateMandatory',
    'oldGreenCandidateAloneNeverMergeAuthority',
    'admissionBecomesStaleWhenMainMoves',
    'acceptanceThresholdWeakeningForbidden',
    'policyRemovalRequiresExplicitUserAuthorization'
  ]) assert.equal(policy.invariants[key], true, key);
  assert.ok(policy.surfaces.some((s) => s.liveRerunRequired === true));
  assert.ok(policy.surfaces.some((s) => s.liveRerunRequired === false));

  const verified = spawnSync(process.execPath, ['scripts/verify-d-series-frozen-candidate-policy.mjs'], { encoding: 'utf8' });
  assert.equal(verified.status, 0, verified.stderr || verified.stdout);
  assert.match(verified.stdout, /main-movement=analysis-not-rerun/);
});

test('architecture lock makes frozen candidate and final admission non-bypassable D-Series invariants', () => {
  const lock = JSON.parse(read('config/d-series-swarm-blockwise-architecture-lock.json'));
  assert.equal(lock.qualificationModel, 'Frozen Candidate -> Branch Qualification -> Admission to Main');
  assert.equal(lock.admissionPolicyFile, 'config/d-series-frozen-candidate-policy.json');
  assert.equal(lock.invariants.expensiveQualificationBelongsToFrozenCandidate, true);
  assert.equal(lock.invariants.mainMovementTriggersAdmissionAnalysisNotAutomaticFullRerun, true);
  assert.equal(lock.invariants.candidateEvidenceSurvivesNonSensitiveMainMovement, true);
  assert.equal(lock.invariants.sensitiveMainMovementRequalifiesOnlyAffectedBlocksByDefault, true);
  assert.equal(lock.invariants.integrationCandidateFingerprintsMandatoryBeforeMerge, true);
  assert.equal(lock.invariants.greenCandidateShaAloneNeverAuthorizesMerge, true);
  assert.equal(lock.invariants.freshAdmissionMandatoryAfterEveryMainMovement, true);
  assert.equal(lock.invariants.automaticFullRerunOnMainMovementForbidden, true);
  assert.equal(lock.invariants.admissionPolicyCannotBeBypassedOrSilentlyRemoved, true);
  assert.match(lock.changePolicy, /MUST NOT restore the old exact-current-main qualification model/);
});

test('automatic qualification manifest fingerprints frozen candidate and admission compares BASE_SHA to current main', () => {
  const script = read('scripts/d-series-qualification-manifest.mjs');
  for (const marker of [
    "mode === 'qualification'",
    "!['qualification', 'admission'].includes(mode)",
    "git(['diff', '--name-only', `${base}..${head}`])",
    "git(['ls-tree', '-r', '--full-tree'",
    'candidateFingerprint !== integrationFingerprint',
    'fingerprint_drift_without_sensitive_main_delta',
    'targetedBlocks',
    'reuseExpensiveEvidence',
    'liveRerunRequired',
    'automaticFullRerunForbidden'
  ]) assert.ok(script.includes(marker), marker);
});

test('candidate qualification is automatic only after full Blockwise and binds exact successful Swarm evidence', () => {
  const workflow = read('.github/workflows/d-series-frozen-candidate-qualification.yml');
  for (const marker of [
    'name: D-Series Frozen Candidate Qualification',
    'workflows:\n      - D-Series Blockwise Preflight',
    'blockwise="$TRIGGER_RUN_ID"',
    'D-Series Sanitation Swarm',
    'no_candidate_bound_swarm_yet',
    'eligible=$eligible',
    "if: steps.resolve.outputs.eligible == 'true'",
    'git merge-base',
    'd-series-qualification-manifest.mjs qualification',
    'd-series-qualification-manifest-${{ github.run_id }}'
  ]) assert.ok(workflow.includes(marker), marker);
  assert.ok(!/workflows:\n(?:\s+- .*\n)*\s+- D-Series Sanitation Swarm\n/.test(workflow), 'Swarm must not independently trigger frozen qualification before Blockwise');
});

test('Admission Gate builds integrated state, reruns only impacted blocks and fails closed on live-sensitive drift', () => {
  const workflow = read('.github/workflows/d-series-admission-gate.yml');
  for (const marker of [
    'name: D-Series Admission Gate',
    'git merge --no-ff --no-commit',
    'integration_tree="$(git write-tree)"',
    'd-series-qualification-manifest.mjs admission',
    '.decision.targetedBlocks[]?',
    'd-series-block-runner.mjs',
    'live_requalification_required',
    'main_moved_during_admission',
    '.decision.admissionPassed=true',
    'd-series-admission-manifest-${{ github.run_id }}'
  ]) assert.ok(workflow.includes(marker), marker);
  assert.ok(!workflow.includes('automatic full rerun'));
});

test('real D-Series Blockwise launch authority now requires fresh integration admission', () => {
  const verifier = read('scripts/verify-d-series-blockwise-preflight-run.sh');
  const admission = read('scripts/verify-d-series-admission-run.sh');
  assert.match(verifier, /frozen-candidate-pull-request/);
  assert.match(verifier, /verify-d-series-admission-run\.sh/);
  assert.match(verifier, /admission=true/);
  assert.match(admission, /no_fresh_admission_for_candidate/);
  assert.match(admission, /integrationTreeSha/);
  assert.match(admission, /decision\.admissionPassed==true/);
  assert.match(admission, /decision\.liveRerunRequired==false/);
  assert.match(admission, /automaticFullRerunForbidden==true/);
});
