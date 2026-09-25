import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const lock = JSON.parse(readFileSync('config/s-series-swarm-blockwise-architecture-lock.json', 'utf8'));
const runtimePolicy = JSON.parse(readFileSync('config/s-series-frozen-candidate-policy.json', 'utf8'));
const policyDoc = readFileSync('docs/benchmarks/S_SERIES_FROZEN_CANDIDATE_QUALIFICATION.md', 'utf8');
const admissionDoc = readFileSync('docs/benchmarks/S_SERIES_SWARM_BLOCKWISE_ADMISSION.md', 'utf8');

test('S-Series expensive qualification is permanently bound to a frozen candidate', () => {
  assert.equal(lock.schema, 'truyn.s-series.swarm-blockwise-architecture-lock.v2');
  assert.equal(lock.sourceBinding.expensiveQualificationBindsToFrozenCandidate, true);
  assert.equal(lock.sourceBinding.mainMovementAloneInvalidatesCandidate, false);
  assert.equal(lock.sourceBinding.mainMovementTriggersAdmissionAnalysis, true);
  assert.equal(lock.sourceBinding.baseToCurrentMainDiffRequired, true);
  assert.equal(lock.sourceBinding.integrationCandidateFingerprintRequired, true);
  assert.equal(lock.sourceBinding.admissionToCurrentMainRequired, true);
  assert.equal(lock.sourceBinding.candidateEvidenceSurvivesUnrelatedMainMovement, true);
  assert.equal(lock.sourceBinding.targetedBlockRequalificationOnSensitiveMainMovement, true);
  assert.equal(lock.sourceBinding.automaticFullLiveRerunOnMainMovement, false);
});

test('S-Series manifest and final admission cannot be replaced by old GREEN SHA', () => {
  assert.equal(lock.qualificationManifest.schema, 'truyn.s-series.qualification-manifest/v1');
  assert.equal(lock.qualificationManifest.finalAdmissionGateMandatory, true);
  assert.equal(lock.qualificationManifest.historicalGreenCandidateShaAloneCanAuthorizeMergeOrCampaign, false);
  assert.equal(lock.qualificationManifest.admissionSnapshotMovementInvalidatesOnlyAdmissionSnapshot, true);
  assert.match(lock.qualificationManifest.fingerprintRule, /sha256/i);
});

test('S-Series documentation preserves Frozen Candidate -> Branch Qualification -> Admission to Main', () => {
  for (const marker of ['Frozen Candidate','Branch Qualification','Admission to Main','BASE_SHA -> current main','integration-candidate fingerprint','old GREEN candidate SHA','rerun the cheap admission analysis only']) {
    assert.ok(policyDoc.includes(marker), `canonical S qualification policy lost marker: ${marker}`);
  }
  assert.match(admissionDoc, /Main movement alone does not invalidate the frozen candidate/);
  assert.match(admissionDoc, /targeted block qualification/i);
  assert.match(admissionDoc, /old GREEN branch SHA by itself can never authorize merge or launch/);
});

test('S-Series forbidden list blocks regression to moving-main qualification', () => {
  const forbidden = lock.forbidden.join('\n');
  for (const marker of ['automatic full S rerun solely because main moved','discarding frozen candidate evidence because unrelated main changed','merge or campaign authorization based only on an old GREEN branch SHA','skipping BASE_SHA to current-main impact analysis','skipping integration-candidate fingerprint recalculation']) {
    assert.ok(forbidden.includes(marker), `missing permanent S-Series prohibition: ${marker}`);
  }
});

test('S-Series executable admission policy is locked and covers all B01-B22 blocks', () => {
  assert.equal(runtimePolicy.schema, 'truyn.s-series.frozen-candidate-policy.v1');
  assert.equal(runtimePolicy.state, 'LOCKED');
  assert.equal(runtimePolicy.model, 'Frozen Candidate -> Branch Qualification -> Admission to Main');
  assert.equal(runtimePolicy.invariants.mainMovementNeverInvalidatesQualificationByItself, true);
  assert.equal(runtimePolicy.invariants.integrationCandidateFingerprintRecomputeMandatory, true);
  assert.equal(runtimePolicy.invariants.oldGreenCandidateAloneNeverMergeAuthority, true);
  const covered = new Set(runtimePolicy.surfaces.flatMap(s => s.blocks));
  for (let i=1;i<=22;i++) assert.ok(covered.has(`B${String(i).padStart(2,'0')}`), `missing B${String(i).padStart(2,'0')} coverage`);
});

test('S-Series automatic manifest and Admission workflows cannot silently disappear', () => {
  for (const path of ['scripts/s-series-qualification-manifest.mjs','.github/workflows/s-series-frozen-candidate-qualification.yml','.github/workflows/s-series-admission-gate.yml']) {
    assert.equal(existsSync(path), true, `missing non-bypassable S admission component: ${path}`);
  }
  const gate = readFileSync('.github/workflows/s-series-admission-gate.yml','utf8');
  assert.match(gate, /Build integration candidate and recalculate fingerprints/);
  assert.match(gate, /automaticFullRerun == false/);
  assert.match(gate, /Verify admission snapshot is still current/);
});
