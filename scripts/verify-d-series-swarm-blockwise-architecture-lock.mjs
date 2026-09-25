#!/usr/bin/env node
import fs from 'node:fs';

const lockPath = 'config/d-series-swarm-blockwise-architecture-lock.json';
const policyPath = 'config/d-series-frozen-candidate-policy.json';
const requiredChain = [
  'SOURCE_CHANGE','SANITATION_SWARM','ROOT_CAUSE_DEDUP','ACCEPTANCE_PRESERVING_REPAIR','TARGETED_BLOCK_QUALIFICATION','FULL_B01_B16_EXACT_SHA','ISOLATED_LIVE_QUALIFICATION_WHERE_REQUIRED','SHARED_CAPACITY_COLLISION_CHECK','ONE_REAL_D_SERIES_RUN','IMMUTABLE_EVIDENCE'
];
const requiredAdmissionChain = [
  'FREEZE_CANDIDATE_SHA','CAPTURE_BASE_SHA','QUALIFY_CANDIDATE_BRANCH','WRITE_QUALIFICATION_MANIFEST_AND_FINGERPRINTS','ALLOW_MAIN_TO_MOVE','COMPARE_BASE_SHA_TO_CURRENT_MAIN','BUILD_INTEGRATION_CANDIDATE','RECOMPUTE_D_SENSITIVE_FINGERPRINTS','RUN_ONLY_IMPACTED_BLOCKS','REQUIRE_LIVE_RERUN_ONLY_WHEN_POLICY_SAYS_REQUIRED','FINAL_ADMISSION_GATE_ON_INTEGRATED_STATE','MERGE_OR_LAUNCH_ONLY_WITH_FRESH_ADMISSION'
];
function fail(reason) { console.error(`TRUYN_D_SERIES_ARCHITECTURE_LOCK=FAIL reason=${reason}`); process.exit(1); }
if (!fs.existsSync(lockPath)) fail('lock_missing');
if (!fs.existsSync(policyPath)) fail('frozen_candidate_policy_missing');
let lock;
try { lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch { fail('lock_invalid_json'); }
if (lock.schema !== 'truyn.d-series.swarm-blockwise-architecture-lock.v1') fail('schema_changed');
if (lock.state !== 'LOCKED') fail('state_not_locked');
if (lock.authority !== 'D-Series') fail('authority_changed');
if (lock.effectiveUntil !== 'ALL_D_SERIES_TESTS_COMPLETE') fail('lifetime_changed');
if (lock.primaryEngine !== 'sanitation-swarm') fail('primary_engine_changed');
if (lock.subordinateAdmissionGate !== 'blockwise-b01-b16') fail('admission_gate_changed');
if (lock.priorityOnConflict !== 'sanitation-swarm') fail('priority_changed');
if (lock.qualificationModel !== 'Frozen Candidate -> Branch Qualification -> Admission to Main') fail('qualification_model_changed');
if (lock.admissionPolicyFile !== policyPath) fail('admission_policy_path_changed');
if (JSON.stringify(lock.canonicalChain) !== JSON.stringify(requiredChain)) fail('canonical_chain_changed');
if (JSON.stringify(lock.admissionChain) !== JSON.stringify(requiredAdmissionChain)) fail('admission_chain_changed');
const requiredTrue = [
  'swarmOwnsDiagnosticsAndRepair','blockwiseMayNotReplaceSwarm','fullBlockwiseRequiresCleanExactShaSwarm','targetedBlockGreenIsNotLaunchAuthorization','realScaleRunRequiresAdmission','realScaleRunIsSingleShot','acceptanceThresholdWeakeningForbidden','silentArchitectureReplacementForbidden','expensiveQualificationBelongsToFrozenCandidate','mainMovementTriggersAdmissionAnalysisNotAutomaticFullRerun','candidateEvidenceSurvivesNonSensitiveMainMovement','sensitiveMainMovementRequalifiesOnlyAffectedBlocksByDefault','integrationCandidateFingerprintsMandatoryBeforeMerge','greenCandidateShaAloneNeverAuthorizesMerge','freshAdmissionMandatoryAfterEveryMainMovement','automaticFullRerunOnMainMovementForbidden','admissionPolicyCannotBeBypassedOrSilentlyRemoved'
];
for (const key of requiredTrue) if (lock.invariants?.[key] !== true) fail(`invariant_${key}_changed`);
if (!/explicit user-authorized architecture change/i.test(lock.changePolicy || '')) fail('change_policy_weakened');
if (!/MUST NOT restore the old exact-current-main qualification model/.test(lock.changePolicy || '')) fail('legacy_model_restore_not_forbidden');
console.log('TRUYN_D_SERIES_ARCHITECTURE_LOCK=PASS primary=sanitation-swarm admission=blockwise-b01-b16 qualification=frozen-candidate lifetime=ALL_D_SERIES_TESTS_COMPLETE');
