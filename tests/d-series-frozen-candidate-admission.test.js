import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('D-500 launch qualification cannot bypass fresh Admission', () => {
  const preflight = read('scripts/class-d-500-preflight-qualification.sh');
  assert.match(preflight, /D_SERIES_ADMISSION_RUN:/);
  assert.match(preflight, /verify-d-series-admission-run\.sh/);
  assert.match(preflight, /fresh-admission-reviewed-attempt/);
  const launchCase = preflight.slice(preflight.indexOf('  launch)'));
  assert.ok(launchCase.indexOf('verify-d-series-admission-run.sh') < launchCase.indexOf('launchable="fresh-admission-reviewed-attempt'));
});

test('D-1000 strict live acceptance cannot start before fresh Admission verification', () => {
  const strict = read('scripts/class-d-1000-strict-acceptance.sh');
  const gate = strict.indexOf('verify-d-series-admission-run.sh');
  const campaign = strict.indexOf('class-d-1000-final-acceptance.sh');
  assert.ok(gate >= 0 && campaign > gate, 'Admission must run before the D-1000 campaign');
  assert.match(strict, /TRUYN_D_SERIES_ADMISSION_RUN/);
});

test('Admission verifier accepts only terminal admitted decisions bound to current main', () => {
  const verifier = read('scripts/verify-d-series-admission-run.sh');
  assert.match(verifier, /currentMainSha == \$main/);
  assert.match(verifier, /ADMIT_WITH_FROZEN_EVIDENCE/);
  assert.match(verifier, /ADMIT_AFTER_TARGETED_REQUALIFICATION/);
  assert.match(verifier, /passedBlocks\|sort/);
  assert.match(verifier, /affectedBlocks\|sort/);
});

test('main movement cannot be represented as automatic full rerun', () => {
  const policy = JSON.parse(read('config/d-series-frozen-candidate-admission.json'));
  assert.equal(policy.rules.mainMovementTriggersAdmissionAnalysisNotAutomaticFullRerun, true);
  assert.equal(policy.rules.onlyAffectedBlocksRequalifyWhenDSensitiveSurfaceChanges, true);
  assert.equal(policy.rules.liveDRunRepeatsOnlyWhenAffectedQualificationProvesItNecessary, true);
  const planner = read('scripts/d-series-admission-plan.mjs');
  assert.match(planner, /automaticFullRerunForbidden: true/);
  assert.doesNotMatch(planner, /affectedBlocks\.length.*B01.*B16/s);
});

test('qualification and admission manifests are machine-bound to candidate, base and integration tree', () => {
  const qualification = read('scripts/d-series-qualification-manifest.mjs');
  const admission = read('scripts/d-series-admission-plan.mjs');
  assert.match(qualification, /candidateTreeSha/);
  assert.match(qualification, /baseSha/);
  assert.match(qualification, /surfaces/);
  assert.match(admission, /integrationTreeSha/);
  assert.match(admission, /baseToCurrentMainChangedFiles/);
  assert.match(admission, /surfaceFingerprints/);
});
