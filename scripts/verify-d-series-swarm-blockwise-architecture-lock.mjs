#!/usr/bin/env node
import fs from 'node:fs';

const lockPath = 'config/d-series-swarm-blockwise-architecture-lock.json';
const requiredChain = [
  'SOURCE_CHANGE',
  'SANITATION_SWARM',
  'ROOT_CAUSE_DEDUP',
  'ACCEPTANCE_PRESERVING_REPAIR',
  'TARGETED_BLOCK_QUALIFICATION',
  'FULL_B01_B16_EXACT_SHA',
  'ISOLATED_LIVE_QUALIFICATION_WHERE_REQUIRED',
  'SHARED_CAPACITY_COLLISION_CHECK',
  'ONE_REAL_D_SERIES_RUN',
  'IMMUTABLE_EVIDENCE'
];

function fail(reason) {
  console.error(`TRUYN_D_SERIES_ARCHITECTURE_LOCK=FAIL reason=${reason}`);
  process.exit(1);
}

if (!fs.existsSync(lockPath)) fail('lock_missing');
let lock;
try {
  lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
} catch {
  fail('lock_invalid_json');
}

if (lock.schema !== 'truyn.d-series.swarm-blockwise-architecture-lock.v1') fail('schema_changed');
if (lock.state !== 'LOCKED') fail('state_not_locked');
if (lock.authority !== 'D-Series') fail('authority_changed');
if (lock.effectiveUntil !== 'ALL_D_SERIES_TESTS_COMPLETE') fail('lifetime_changed');
if (lock.primaryEngine !== 'sanitation-swarm') fail('primary_engine_changed');
if (lock.subordinateAdmissionGate !== 'blockwise-b01-b16') fail('admission_gate_changed');
if (lock.priorityOnConflict !== 'sanitation-swarm') fail('priority_changed');
if (JSON.stringify(lock.canonicalChain) !== JSON.stringify(requiredChain)) fail('canonical_chain_changed');

const requiredTrue = [
  'swarmOwnsDiagnosticsAndRepair',
  'blockwiseMayNotReplaceSwarm',
  'fullBlockwiseRequiresCleanExactShaSwarm',
  'targetedBlockGreenIsNotLaunchAuthorization',
  'realScaleRunRequiresAdmission',
  'realScaleRunIsSingleShot',
  'acceptanceThresholdWeakeningForbidden',
  'silentArchitectureReplacementForbidden'
];
for (const key of requiredTrue) {
  if (lock.invariants?.[key] !== true) fail(`invariant_${key}_changed`);
}

console.log('TRUYN_D_SERIES_ARCHITECTURE_LOCK=PASS primary=sanitation-swarm admission=blockwise-b01-b16 lifetime=ALL_D_SERIES_TESTS_COMPLETE');
