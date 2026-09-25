import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
    'historicalEvidenceBoundToImmutableRunSha',
    'admissionContractSelfModificationRequiresCandidateSideGate',
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
  assert.match(verified.stdout, /evidence-binding=immutable-run-sha/);
  assert.match(verified.stdout, /self-admission=mandatory/);
  assert.match(verified.stdout, /main-movement=analysis-not-rerun/);
});

test('architecture lock makes frozen candidate and final admission non-bypassable D-Series invariants', () => {
  const lock = JSON.parse(read('config/d-series-swarm-blockwise-architecture-lock.json'));
  assert.equal(lock.qualificationModel, 'Frozen Candidate -> Branch Qualification -> Admission to Main');
  assert.equal(lock.admissionPolicyFile, 'config/d-series-frozen-candidate-policy.json');
  assert.equal(lock.invariants.expensiveQualificationBelongsToFrozenCandidate, true);
  assert.equal(lock.invariants.historicalEvidenceBoundToImmutableRunSha, true);
  assert.equal(lock.invariants.admissionContractSelfModificationRequiresCandidateSideGate, true);
  assert.equal(lock.invariants.mainMovementTriggersAdmissionAnalysisNotAutomaticFullRerun, true);
  assert.equal(lock.invariants.candidateEvidenceSurvivesNonSensitiveMainMovement, true);
  assert.equal(lock.invariants.sensitiveMainMovementRequalifiesOnlyAffectedBlocksByDefault, true);
  assert.equal(lock.invariants.integrationCandidateFingerprintsMandatoryBeforeMerge, true);
  assert.equal(lock.invariants.greenCandidateShaAloneNeverAuthorizesMerge, true);
  assert.equal(lock.invariants.freshAdmissionMandatoryAfterEveryMainMovement, true);
  assert.equal(lock.invariants.automaticFullRerunOnMainMovementForbidden, true);
  assert.equal(lock.invariants.admissionPolicyCannotBeBypassedOrSilentlyRemoved, true);
  assert.match(lock.changePolicy, /immutable execution-time workflow SHA fields/);
  assert.match(lock.changePolicy, /candidate-side D-Series Self-Admission gate/);
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

test('candidate qualification waits for an immutable exact GREEN Swarm + Blockwise pair regardless of completion order or unrelated Actions churn', () => {
  const workflow = read('.github/workflows/d-series-frozen-candidate-qualification.yml');
  for (const marker of [
    'name: D-Series Frozen Candidate Qualification',
    'D-Series Sanitation Swarm',
    'D-Series Blockwise Preflight',
    "'D-Series Sanitation Swarm'|'D-Series Blockwise Preflight'",
    "if [[ \"$trigger_name\" == 'D-Series Sanitation Swarm' ]]",
    'swarm="$TRIGGER_RUN_ID"',
    'blockwise="$TRIGGER_RUN_ID"',
    'candidate_bound_pair_not_ready',
    'eligible=$eligible',
    "if: steps.resolve.outputs.eligible == 'true'",
    "candidate=\"$(jq -r '.head_sha // empty'",
    'actions/workflows/d-series-blockwise-preflight.yml/runs?status=completed&event=pull_request&head_sha=${candidate}&per_page=100',
    'actions/workflows/d200-bug-hunt.yml/runs?status=completed&event=pull_request&head_sha=${candidate}&per_page=100',
    '.head_sha==$c',
    '(.head_commit.id // .head_sha)==$c',
    'git merge-base',
    'd-series-qualification-manifest.mjs qualification',
    'd-series-qualification-manifest-${{ github.run_id }}'
  ]) assert.ok(workflow.includes(marker), marker);
  assert.ok(!workflow.includes('.pull_requests[0].head.sha'), 'mutable embedded PR head must never bind historical D evidence');
  assert.ok(!workflow.includes('actions/runs?status=completed&per_page=100'), 'qualification must not depend on a bounded repository-wide recent-runs window');
});

test('Admission Gate builds integrated state, reruns only impacted blocks and closes live drift only after targeted PASS evidence', () => {
  const workflow = read('.github/workflows/d-series-admission-gate.yml');
  for (const marker of [
    'name: D-Series Admission Gate',
    'git merge --no-ff --no-commit',
    'integration_tree="$(git write-tree)"',
    'd-series-qualification-manifest.mjs admission',
    '.decision.targetedBlocks[]?',
    'd-series-block-runner.mjs',
    'finalize-d-series-admission.mjs',
    '--result-prefix admission-',
    'main_moved_during_admission',
    '.decision.targetedRequalificationPassed==true',
    '.decision.liveRerunSatisfied==true',
    '.decision.admissionPassed==true',
    'd-series-admission-manifest-${{ github.run_id }}'
  ]) assert.ok(workflow.includes(marker), marker);
  assert.ok(!workflow.includes('reason=live_requalification_required'), 'successful targeted reruns must be finalizable rather than permanently rejected');
  assert.ok(!workflow.includes('automatic full rerun'));
});

test('targeted live requalification finalizer is fail-closed and persists immutable PASS evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'truyn-d-series-finalize-'));
  try {
    const tree = 'a'.repeat(40);
    const manifestPath = path.join(dir, 'manifest.json');
    const resultPrefix = `${path.join(dir, 'admission-')}`;
    const outputPath = path.join(dir, 'final.json');
    fs.writeFileSync(manifestPath, JSON.stringify({
      schema: 'truyn.d-series.admission-manifest.v1',
      scale: 'd500',
      candidateSha: 'c'.repeat(40),
      integrationTreeSha: tree,
      decision: {
        automaticFullRerunForbidden: true,
        targetedBlocks: ['B01'],
        liveRerunRequired: true,
        status: 'LIVE_REQUALIFICATION_REQUIRED'
      }
    }));
    fs.writeFileSync(`${resultPrefix}B01.json`, JSON.stringify({
      schema: 'truyn.d-series.block-result.v1',
      blockId: 'B01',
      status: 'PASS',
      sourceSha: tree,
      scale: '500',
      classesTested: [500],
      fingerprint: 'b'.repeat(64),
      startedAt: '2026-09-25T00:00:00.000Z',
      finishedAt: '2026-09-25T00:00:01.000Z'
    }));

    const ok = spawnSync(process.execPath, [
      'scripts/finalize-d-series-admission.mjs',
      '--manifest', manifestPath,
      '--result-prefix', resultPrefix,
      '--output', outputPath
    ], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr || ok.stdout);
    const final = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    assert.equal(final.decision.admissionPassed, true);
    assert.equal(final.decision.liveRerunOriginallyRequired, true);
    assert.equal(final.decision.liveRerunSatisfied, true);
    assert.equal(final.decision.liveRerunRequired, false);
    assert.equal(final.decision.targetedRequalificationPassed, true);
    assert.equal(final.requalification.allPassed, true);
    assert.equal(final.requalification.results.B01.sourceSha, tree);
    assert.match(final.requalification.results.B01.evidenceDigest, /^sha256:[0-9a-f]{64}$/);

    fs.unlinkSync(`${resultPrefix}B01.json`);
    const missing = spawnSync(process.execPath, [
      'scripts/finalize-d-series-admission.mjs',
      '--manifest', manifestPath,
      '--result-prefix', resultPrefix,
      '--output', outputPath
    ], { encoding: 'utf8' });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /targeted_result_missing/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('candidate-side self-admission closes admission-contract bootstrap without bypassing final gate', () => {
  const workflow = read('.github/workflows/d-series-candidate-self-admission.yml');
  for (const marker of [
    'name: D-Series Candidate Self-Admission',
    'pull_request:',
    'Wait for exact immutable Swarm and Blockwise evidence',
    '.head_sha==$sha',
    '(.head_commit.id // .head_sha)==$sha',
    'Build candidate-owned qualification manifest',
    'd-series-qualification-manifest.mjs qualification',
    'Build integrated state and recompute D fingerprints',
    'git merge --no-ff --no-commit',
    'd-series-qualification-manifest.mjs admission',
    'Requalify only D-sensitive blocks changed on main',
    '.decision.targetedBlocks[]?',
    'finalize-d-series-admission.mjs',
    '--result-prefix self-admission-',
    'main_moved_during_admission',
    '.decision.targetedRequalificationPassed==true',
    '.decision.liveRerunSatisfied==true',
    '.decision.candidateSideBootstrap=true',
    'd-series-self-admission-manifest-${{ github.run_id }}'
  ]) assert.ok(workflow.includes(marker), marker);
  assert.ok(!workflow.includes('reason=live_requalification_required'));
});

test('real D-Series Blockwise launch authority requires a successful finalized integration admission', () => {
  const verifier = read('scripts/verify-d-series-blockwise-preflight-run.sh');
  const admission = read('scripts/verify-d-series-admission-run.sh');
  assert.match(verifier, /frozen-candidate-pull-request/);
  assert.match(verifier, /verify-d-series-admission-run\.sh/);
  assert.match(verifier, /admission=true/);
  assert.match(admission, /no_fresh_admission_for_candidate/);
  assert.match(admission, /\.name=="D-Series Admission Gate"/);
  assert.match(admission, /\.conclusion=="success"/);
  assert.match(admission, /integrationTreeSha/);
  assert.match(admission, /decision\.admissionPassed==true/);
  assert.match(admission, /decision\.liveRerunRequired==false/);
  assert.match(admission, /decision\.liveRerunSatisfied==true/);
  assert.match(admission, /decision\.targetedRequalificationPassed==true/);
  assert.match(admission, /requalification\.allPassed==true/);
  assert.match(admission, /evidenceDigest/);
  assert.match(admission, /automaticFullRerunForbidden==true/);
});
