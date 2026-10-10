export function requiredFSeriesLease(runId) {
  if (typeof runId !== 'string' || runId.trim() === '') throw new Error('runId required');
  return {
    seriesId: 'F',
    runId: runId.trim(),
    resourceClass: 'R2',
    resourceKey: 'f-physical-chaos-fault-domain',
    exclusive: true,
    scope: 'dedicated-f-series-domain-only'
  };
}
