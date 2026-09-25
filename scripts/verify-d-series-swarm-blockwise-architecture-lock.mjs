#!/usr/bin/env node
import fs from 'node:fs';

const lockPath = 'config/d-series-swarm-blockwise-architecture-lock.json';
const requiredChain = [
  'FROZEN_CANDIDATE',
  'SANITATION_SWARM_BRANCH_QUALIFICATION',
  'ROOT_CAUSE_DEDUP',
  'ACCEPTANCE_PRESERVING_REPAIR',
  'FULL_B01_B16_BRANCH_QUALIFICATION',
  'IMMUTABLE_QUALIFICATION_MANIFEST',
  'MAIN_MOVEMENT_ADMISSION_ANALYSIS',
  'INTEGRATION_FINGERPRINT_RECALC',
  'TARGETED_AFFECTED_BLOCK_REQUALIFICATION_IF_NEEDED',
  'FRESH_ADMISSION_GATE',
  'SHARED_CAPACITY_COLLISION_CHECK',
  'ONE_REAL_D_SERIES_RUN_IF_REQUIRED',
  'IMMUTABLE_EVIDENCE'
];

function fail(reason) {
  console.error(`TRUYN_D_SERIES_ARCHITECTURE_LOCK=FAIL reason=${reason}`);
  process.exit(1);
}

if (!fs.existsSync(lockPath)) fail('lock_missing');
let lock;
try { lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch { fail('lock_invalid_json'); }
if (lock.schema !== 'truyn.d-series.swarm-blockwise-architecture-lock.v2') fail('schema_changed');
if (lock.state !== 'LOCKED') fail('state_not_locked');
if (lock.authority !== 'D-Series') fail('authority_changed');
if (lock.effectiveUntil !== 'ALL_D_SERIES_TESTS_COMPLETE') fail('lifetime_changed');
if (lock.primaryEngine !== 'sanitation-swarm') fail('primary_engine_changed');
if (lock.subordinateAdmissionGate !== 'blockwise-b01-b16') fail('blockwise_gate_changed');
if (lock.integrationAdmissionGate !== 'frozen-candidate-admission-to-main') fail('integration_gate_changed');
if (lock.priorityOnConflict !== 'sanitation-swarm') fail('priority_changed');
if (JSON.stringify(lock.canonicalChain) !== JSON.stringify(requiredChain)) fail('canonical_chain_changed');
const requiredTrue = [
  'swarmOwnsDiagnosticsAndRepair',
  'blockwiseMayNotReplaceSwarm',
  'fullBlockwiseRequiresCleanFrozenCandidateSwarm',
  'frozenQualificationIndependentOfMovingMain',
  'mainMovementTriggersAdmissionNotAutomaticFullRerun',
  'baseToCurrentMainDiffIsMandatory',
  'integrationFingerprintsAreMandatory',
  'unaffectedFrozenEvidenceRemainsValid',
  'onlyAffectedBlocksRequalify',
  'oldGreenCandidateNeverAuthorizesMergeByItself',
  'freshAdmissionRequiredBeforeMergeOrLaunch',
  'admissionStaleAfterMainMovement',
  'targetedBlockGreenIsNotLaunchAuthorization',
  'realScaleRunRequiresAdmission',
  'realScaleRunIsSingleShot',
  'liveRerunOnlyWhenProvenNecessary',
  'acceptanceThresholdWeakeningForbidden',
  'silentArchitectureReplacementForbidden'
];
for (const key of requiredTrue) if (lock.invariants?.[key] !== true) fail(`invariant_${key}_changed`);
console.log('TRUYN_D_SERIES_ARCHITECTURE_LOCK=PASS primary=sanitation-swarm qualification=frozen-candidate admission=fresh-integration-gate lifetime=ALL_D_SERIES_TESTS_COMPLETE');
