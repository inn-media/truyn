export function validateFaultDomainPlan(plan) {
  const errors = [];
  if (plan?.cloud !== 'azure') errors.push('F v1 destructive fault domain must be Azure');
  if (!plan?.dedicatedResourceGroups || plan.dedicatedResourceGroups.length < 2) errors.push('separate workload and evidence/control resource groups required');
  if (plan?.vnetPeeringToForeignBenchmarks !== false) errors.push('fault-domain VNet must have no peering to foreign benchmark domains');
  if (plan?.observerInsideDestructiveDomain !== false) errors.push('observer must be outside destructive domain');
  if (plan?.evidenceStoreInsideDestructiveDomain !== false) errors.push('evidence store must be outside destructive domain');
  if (plan?.foreignSeriesResourceSelectorsAllowed !== false) errors.push('foreign-series selectors must be impossible');
  if (plan?.r2LeaseRequired !== true) errors.push('exclusive R2 lease required');
  return { ok: errors.length === 0, errors };
}
