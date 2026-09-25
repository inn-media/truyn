import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lock = JSON.parse(readFileSync('config/e-series-swarm-blockwise-architecture-lock.json', 'utf8'));
const doc = readFileSync('docs/benchmarks/E_SERIES_SWARM_BLOCKWISE_ADMISSION.md', 'utf8');

const REQUIRED = ['E-COMMON','E-DECOMPOSE','E-PER-RESULT','E-KNEE','E-DEGRADE','E-PROVIDER-SMOKE'];

test('E-Series Swarm-Blockwise architecture is permanently locked until all E tests complete', () => {
  assert.equal(lock.schema, 'truyn.e-series.swarm-blockwise-architecture-lock.v1');
  assert.equal(lock.state, 'LOCKED');
  assert.equal(lock.effectiveUntil, 'ALL_E_SERIES_TESTS_COMPLETE');
  assert.equal(lock.qualificationModel, 'Frozen Candidate -> Qualification Swarm -> Blockwise Admission to Main -> Paid/Measured Boundary');
});

test('E qualification swarm is fail-collect, six-block, zero-paid and mandatory before admission', () => {
  assert.equal(lock.swarm.mode, 'fail-collect');
  assert.equal(lock.swarm.failFast, false);
  assert.deepEqual(lock.swarm.requiredBlocks, REQUIRED);
  assert.equal(lock.swarm.allBlocksRunIndependently, true);
  assert.equal(lock.swarm.collectAllDiagnosticsBeforeVerdict, true);
  assert.equal(lock.swarm.eachBlockEmitsImmutableEvidence, true);
  assert.equal(lock.swarm.mustPrecedeBlockwiseAdmission, true);
  assert.equal(lock.swarm.paidProviderCalls, 0);
});

test('Blockwise Admission is non-bypassable and preserves frozen-candidate independence from moving main', () => {
  assert.equal(lock.sourceBinding.expensiveQualificationBindsToFrozenCandidate, true);
  assert.equal(lock.sourceBinding.mainMovementAloneInvalidatesCandidate, false);
  assert.equal(lock.sourceBinding.mainMovementTriggersAdmissionAnalysis, true);
  assert.equal(lock.sourceBinding.baseToCurrentMainDiffRequired, true);
  assert.equal(lock.sourceBinding.integrationCandidateFingerprintRequired, true);
  assert.equal(lock.sourceBinding.candidateEvidenceSurvivesUnrelatedMainMovement, true);
  assert.equal(lock.sourceBinding.unrelatedMainMovementDoesNotInvalidateAdmission, true);
  assert.equal(lock.sourceBinding.eSensitiveMainMovementInvalidatesAdmission, true);
  assert.equal(lock.sourceBinding.semanticStalenessRequired, true);
  assert.equal(lock.sourceBinding.automaticFullLiveRerunOnMainMovement, false);
  assert.equal(lock.blockwiseAdmission.allRequiredBlocksGreen, true);
  assert.equal(lock.blockwiseAdmission.freshIntegrationFingerprintRequired, true);
  assert.equal(lock.blockwiseAdmission.freshR1InterferenceGuardRequired, true);
  assert.equal(lock.blockwiseAdmission.freshR2CollisionOrLeaseGuardRequired, true);
  assert.equal(lock.blockwiseAdmission.duplicateHistoryGuardRequired, true);
  assert.equal(lock.blockwiseAdmission.budgetGuardRequired, true);
  assert.equal(lock.blockwiseAdmission.staleAdmissionFailsClosed, true);
  assert.equal(lock.blockwiseAdmission.staleAdmissionDefinition, 'E_SENSITIVE_DRIFT_ONLY');
  assert.equal(lock.blockwiseAdmission.unrelatedMainMovementDoesNotStaleAdmission, true);
  assert.equal(lock.paidBoundary.admissionFreshnessMustBeSemantic, true);
});

test('every paid or measured E boundary must consume successful Blockwise Admission', () => {
  assert.deepEqual(lock.paidBoundary.sequence, ['S24_PROVIDER_SMOKE','E_DECOMPOSE','E_PER_RESULT','E_KNEE','E_DEGRADE']);
  assert.equal(lock.paidBoundary.everyPaidOrMeasuredWorkflowMustConsumeSuccessfulBlockwiseAdmission, true);
  assert.equal(lock.paidBoundary.directCandidateOnlyDispatchForbidden, true);
  assert.equal(lock.paidBoundary.historicalGreenQualificationAloneForbidden, true);
  assert.equal(lock.paidBoundary.admissionRunIdentityMustBeVerified, true);
  assert.equal(lock.paidBoundary.admissionEvidenceCandidateShaMustMatch, true);
  assert.equal(lock.paidBoundary.admissionEvidenceMustBeGreen, true);
});

test('canonical E family cells remain independent and explicit', () => {
  assert.deepEqual(lock.campaignFamilies['E-DECOMPOSE'].independentCells, [50,100,200,500]);
  assert.equal(lock.campaignFamilies['E-PER-RESULT'].pairedDirectControlRequired, true);
  assert.deepEqual(lock.campaignFamilies['E-KNEE'].independentCells, [50,75,100,150,200,350,500]);
  assert.deepEqual(lock.campaignFamilies['E-DEGRADE'].independentCells, [50,100,200,500]);
});

test('documentation locks the two-level engine and material R0/R1/R2 semantics', () => {
  for (const marker of [
    'Level 1 — E Qualification Swarm',
    'Level 2 — E Blockwise Admission',
    'fail-fast=false',
    'BASE_SHA -> current main',
    'semantic freshness',
    'SHA inequality alone is never sufficient evidence of E staleness',
    'S24 Provider Smoke',
    'E/DECOMPOSE',
    'E/PER-RESULT',
    'E/KNEE',
    'E/DEGRADE',
    'R0: independent',
    'R1: concurrent',
    'R2: exclusive',
    'No E paid or measured workflow may reach provider execution from `candidate_sha` alone.'
  ]) assert.ok(doc.includes(marker), `missing E Swarm-Blockwise marker: ${marker}`);
});
