import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lock = JSON.parse(readFileSync('config/s-series-swarm-blockwise-architecture-lock.json', 'utf8'));
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
  for (const marker of [
    'Frozen Candidate',
    'Branch Qualification',
    'Admission to Main',
    'BASE_SHA -> current main',
    'integration-candidate fingerprint',
    'old GREEN branch SHA',
    'rerun the cheap admission analysis only'
  ]) {
    assert.ok(policyDoc.includes(marker), `canonical S qualification policy lost marker: ${marker}`);
  }
  assert.match(admissionDoc, /Main movement alone does not invalidate the frozen candidate/);
  assert.match(admissionDoc, /targeted block qualification/i);
  assert.match(admissionDoc, /old GREEN branch SHA by itself can never authorize merge or launch/);
});

test('S-Series forbidden list blocks regression to moving-main qualification', () => {
  const forbidden = lock.forbidden.join('\n');
  for (const marker of [
    'automatic full S rerun solely because main moved',
    'discarding frozen candidate evidence because unrelated main changed',
    'merge or campaign authorization based only on an old GREEN branch SHA',
    'skipping BASE_SHA to current-main impact analysis',
    'skipping integration-candidate fingerprint recalculation'
  ]) {
    assert.ok(forbidden.includes(marker), `missing permanent S-Series prohibition: ${marker}`);
  }
});
