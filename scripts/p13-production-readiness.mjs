import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const file = (path) => resolve(root, path);
const plan = () => JSON.parse(readFileSync(file('operations/p13-production-cutover-plan.json'), 'utf8'));

export function evaluateP13ProductionReadiness(inventory, evidence = {}) {
  if (inventory?.schema !== 'truyn.p13.production-cutover-plan/v1'
    || inventory?.lane !== 'PRODUCTION_OPERATIONS'
    || inventory?.formatCompatibilityGate !== 'INDEPENDENT_REQUIRED_FOR_ACTUAL_TARGET'
    || inventory?.rules?.noLiveMutationByReadinessGate !== true
    || inventory?.rules?.noSyntheticSource !== true
    || inventory?.rules?.requireIndependentAttestation !== true) {
    throw new Error('p13_invalid_cutover_contract');
  }
  if (!Array.isArray(inventory.domains) || inventory.domains.length !== 10
    || new Set(inventory.domains.map(x => x.id)).size !== 10
    || !Array.isArray(inventory.phases) || inventory.phases.length !== 10
    || new Set(inventory.phases.map(x => x.id)).size !== 10) {
    throw new Error('p13_incomplete_source_or_phase_inventory');
  }
  for (const item of inventory.domains) {
    if (typeof item.reference !== 'string' || !existsSync(file(item.reference)))
      throw new Error('p13_missing_source_contract:' + item.id);
  }
  const matrix = readFileSync(file(inventory.networkProtocol.compatibility), 'utf8');
  const reasons = [];
  if (/draft\s*\/\s*implemented reference generation/.test(matrix)
    || inventory.networkProtocol.maturity !== 'stable')
    reasons.push('stable_TRUYN_1_not_declared');
  if (inventory.networkProtocol.nextGeneration === 'NOT_IMPLEMENTED')
    reasons.push('protocol_generation_bridge_not_implemented');
  if (evidence.source?.authoritative !== true
    || !/^[a-f0-9]{64}$/.test(evidence.source?.digest || '')
    || !Number.isSafeInteger(evidence.source?.revision) || evidence.source.revision < 1)
    reasons.push('real_source_snapshot_digest_revision_unverified');
  for (const phase of inventory.phases) {
    const v = evidence.phases?.find(x => x.id === phase.id);
    if (v?.verified !== true || !Number.isSafeInteger(v.runId) || v.runId < 1)
      reasons.push('missing_live_phase:' + phase.id);
  }
  for (const domain of inventory.domains) {
    const v = evidence.domains?.find(x => x.id === domain.id);
    if (v?.snapshot !== true || v.backup !== true || v.rollback !== true
      || v.negativeTests !== true || !Number.isSafeInteger(v.runId) || v.runId < 1)
      reasons.push('missing_domain_proof:' + domain.id);
  }
  // This report is an inventory/preflight only. Even fabricated all-true booleans
  // must never be treated as an independently verified cutover authorization.
  return {
    schema:'truyn.p13.production-readiness-report/v1',
    lane:'PRODUCTION_OPERATIONS',
    formatCompatibilityCertifiedByThisReport:false,
    status:'BLOCKED',
    cutoverAuthorized:false,
    productionMutationsPerformed:false,
    sensitiveSourceRead:false,
    domainCount:inventory.domains.length,
    requiredPhaseCount:inventory.phases.length,
    blockers:reasons,
    next:'Independent live source, PITR restore, protocol canary and rollback attestations must be reconciled by a separate privileged production controller.'
  };
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const args = process.argv.slice(2);
  const ev = args.indexOf('--evidence');
  const evidence = ev >= 0 ? JSON.parse(readFileSync(args[ev + 1], 'utf8')) : {};
  const result = evaluateP13ProductionReadiness(plan(), evidence);
  const out = args.indexOf('--output');
  if (out >= 0) writeFileSync(args[out + 1], JSON.stringify(result, null, 2) + '\n', {mode:0o600});
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
