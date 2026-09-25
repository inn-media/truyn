#!/usr/bin/env node
import fs from 'node:fs';
const lockPath='config/n-series-frozen-candidate-policy.json';
const fail=reason=>{console.error(`TRUYN_N_SERIES_FROZEN_CANDIDATE_POLICY=FAIL reason=${reason}`);process.exit(1)};
if(!fs.existsSync(lockPath)) fail('policy_missing');
let p; try{p=JSON.parse(fs.readFileSync(lockPath,'utf8'))}catch{fail('invalid_json')}
if(p.schema!=='truyn.n-series.frozen-candidate-policy.v1') fail('schema_changed');
if(p.state!=='LOCKED'||p.authority!=='N-Series'||p.effectiveUntil!=='ALL_N_SERIES_TESTS_COMPLETE') fail('lock_changed');
if(p.model!=='Frozen Candidate -> Branch Qualification -> Admission to Main') fail('model_changed');
const required=['expensiveQualificationBoundToFrozenCandidate','mainMovementNeverInvalidatesQualificationByItself','admissionComparesBaseShaToCurrentMain','noSensitiveMainDriftReusesExpensiveEvidence','sensitiveMainDriftRunsOnlyAffectedBlocks','selectiveBlockRunnerMandatory','allTargetedBlocksMustPass','automaticFullRerunOnMainMovementForbidden','liveRerunOnlyWhenSensitivePolicyRequires','integrationCandidateFingerprintRecomputeMandatory','finalAdmissionGateMandatory','oldGreenCandidateAloneNeverMergeAuthority','admissionBecomesStaleWhenMainMoves','acceptanceThresholdWeakeningForbidden','qualificationManifestMandatory','policyRemovalRequiresExplicitUserAuthorization'];
for(const key of required) if(p.invariants?.[key]!==true) fail(`invariant_${key}_changed`);
if(!fs.existsSync('scripts/n-series-selective-block-runner.mjs')) fail('selective_runner_missing');
if(!Array.isArray(p.surfaces)||p.surfaces.length<6) fail('sensitive_surfaces_missing');
const ids=new Set(); for(const s of p.surfaces){if(!s.id||ids.has(s.id)) fail('surface_id_invalid');ids.add(s.id);if(!Array.isArray(s.prefixes)||!s.prefixes.length) fail(`surface_${s.id}_prefixes_missing`);if(!Array.isArray(s.blocks)||!s.blocks.length) fail(`surface_${s.id}_blocks_missing`);for(const b of s.blocks) if(!/^N[1-7]$/.test(b)) fail(`surface_${s.id}_block_invalid`);if(typeof s.liveRerunRequired!=='boolean') fail(`surface_${s.id}_live_policy_missing`)}
console.log('TRUYN_N_SERIES_FROZEN_CANDIDATE_POLICY=PASS selective-runner=mandatory admission=mandatory main-movement=analysis-not-rerun');
