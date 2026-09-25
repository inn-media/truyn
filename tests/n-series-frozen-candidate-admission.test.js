import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const p = JSON.parse(fs.readFileSync('config/n-series-frozen-candidate-policy.json', 'utf8'));

test('N-Series expensive qualification is candidate-bound and main movement is analysis, not rerun', () => {
  assert.equal(p.state, 'LOCKED');
  assert.equal(p.model, 'Frozen Candidate -> Branch Qualification -> Admission to Main');
  assert.equal(p.invariants.expensiveQualificationBoundToFrozenCandidate, true);
  assert.equal(p.invariants.mainMovementNeverInvalidatesQualificationByItself, true);
  assert.equal(p.invariants.automaticFullRerunOnMainMovementForbidden, true);
});

test('N-Series cannot merge from historical GREEN candidate evidence alone', () => {
  assert.equal(p.invariants.oldGreenCandidateAloneNeverMergeAuthority, true);
  assert.equal(p.invariants.integrationCandidateFingerprintRecomputeMandatory, true);
  assert.equal(p.invariants.finalAdmissionGateMandatory, true);
  assert.equal(p.invariants.admissionBecomesStaleWhenMainMoves, true);
});

test('N-Series selective requalification and manifest are mandatory', () => {
  assert.equal(p.invariants.admissionComparesBaseShaToCurrentMain, true);
  assert.equal(p.invariants.sensitiveMainDriftRunsOnlyAffectedBlocks, true);
  assert.equal(p.invariants.qualificationManifestMandatory, true);
  assert.ok(p.surfaces.some(s => s.liveRerunRequired));
});
