import { evaluateFSeries } from './evaluate.js';
import { verifyHashChain } from './evidence-chain.js';

export function reconcileFSeries({ candidate, contract, evidenceChain, activityLogIndex, independentResourceSnapshot }) {
  const result = evaluateFSeries(candidate, contract);
  const reasons = [...result.reasons];

  if (!verifyHashChain(evidenceChain ?? [])) reasons.push('evidence hash chain invalid');
  if (!independentResourceSnapshot?.faultDomainDeletedOrHealthy) reasons.push('independent post-run resource reconciliation missing');

  const azureEpisodeRefs = new Set(
    (candidate?.episodes ?? [])
      .filter((e) => String(e.mechanism).startsWith('azure_'))
      .map((e) => e.azureActivityLogRef)
      .filter(Boolean)
  );
  const activityRefs = new Set((activityLogIndex ?? []).map((x) => x.ref));
  for (const ref of azureEpisodeRefs) if (!activityRefs.has(ref)) reasons.push(`missing independently exported Activity Log record: ${ref}`);

  return {
    status: reasons.length ? 'FAIL_RECONCILIATION' : contract.acceptance.terminalStatus,
    claimEligible: reasons.length === 0,
    reasons,
    recovery: result.recovery
  };
}
