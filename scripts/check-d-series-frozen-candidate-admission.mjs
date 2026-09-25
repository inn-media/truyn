#!/usr/bin/env node
import fs from 'node:fs';

const file = 'config/d-series-frozen-candidate-admission.json';
const fail = (reason) => { console.error(`TRUYN_D_SERIES_FROZEN_ADMISSION_LOCK=FAIL reason=${reason}`); process.exit(1); };
if (!fs.existsSync(file)) fail('policy_missing');
let policy;
try { policy = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { fail('invalid_json'); }
if (policy.schema !== 'truyn.d-series.frozen-candidate-admission.v1') fail('schema_changed');
if (policy.state !== 'LOCKED') fail('state_not_locked');
if (policy.authority !== 'D-Series') fail('authority_changed');
if (policy.effectiveUntil !== 'ALL_D_SERIES_TESTS_COMPLETE') fail('lifetime_changed');
if (policy.model !== 'FROZEN_CANDIDATE_BRANCH_QUALIFICATION_ADMISSION_TO_MAIN') fail('model_changed');
for (const key of [
  'expensiveQualificationBelongsToFrozenCandidate',
  'mainMovementTriggersAdmissionAnalysisNotAutomaticFullRerun',
  'oldGreenBranchShaAloneNeverAuthorizesMerge',
  'finalAdmissionRunsAgainstCombinedIntegrationState',
  'baseToCurrentMainDiffMustBeAnalyzed',
  'unaffectedFrozenEvidenceRemainsValid',
  'onlyAffectedBlocksRequalifyWhenDSensitiveSurfaceChanges',
  'affectedBlocksMustPassOnIntegrationStateBeforeAdmission',
  'liveDRunRepeatsOnlyWhenAffectedQualificationProvesItNecessary',
  'admissionBecomesStaleIfMainMovesAfterAdmission',
  'acceptanceThresholdWeakeningForbidden',
  'silentBypassForbidden'
]) if (policy.rules?.[key] !== true) fail(`rule_${key}_changed`);
if (!Array.isArray(policy.surfaces) || policy.surfaces.length < 8) fail('surfaces_incomplete');
const blocks = new Set(policy.surfaces.flatMap((surface) => surface.blocks || []));
for (let i = 1; i <= 16; i += 1) {
  const block = `B${String(i).padStart(2, '0')}`;
  if (!blocks.has(block)) fail(`block_unmapped_${block}`);
}
for (const surface of policy.surfaces) {
  if (!surface.id || !Array.isArray(surface.blocks) || !surface.blocks.length || !Array.isArray(surface.patterns) || !surface.patterns.length) fail(`surface_invalid_${surface.id || 'unknown'}`);
  for (const pattern of surface.patterns) { try { new RegExp(pattern); } catch { fail(`surface_regex_invalid_${surface.id}`); } }
}
for (const decision of ['ADMIT_WITH_FROZEN_EVIDENCE', 'REQUALIFY_AFFECTED_BLOCKS', 'ADMIT_AFTER_TARGETED_REQUALIFICATION', 'REJECT_CONFLICT', 'REJECT_STALE_OR_INVALID_MANIFEST']) {
  if (!policy.admission?.allowedDecisions?.includes(decision)) fail(`decision_missing_${decision}`);
}
console.log('TRUYN_D_SERIES_FROZEN_ADMISSION_LOCK=PASS model=Frozen-Candidate->Branch-Qualification->Admission-to-Main lifetime=ALL_D_SERIES_TESTS_COMPLETE');
