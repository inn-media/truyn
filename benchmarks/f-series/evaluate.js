import { validateImpactProofEpisode } from './impact-proof.js';

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const rank = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank))];
}

export function recoveryStats(samples) {
  const sorted = [...samples].filter(Number.isFinite).sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 0.50),
    p95: percentile(sorted, 0.95),
    p99: sorted.length >= 100 ? percentile(sorted, 0.99) : null,
    p99Label: sorted.length >= 100 ? 'p99' : 'max_not_percentile',
    max: sorted.length ? sorted.at(-1) : null
  };
}

export function evaluateFSeries(candidate, contract) {
  const reasons = [];
  const episodes = candidate?.episodes ?? [];
  if (!episodes.length) reasons.push('no physical fault episodes');

  for (const episode of episodes) {
    const check = validateImpactProofEpisode(episode);
    if (!check.ok) reasons.push(...check.errors.map((x) => `${episode?.episodeId ?? 'unknown'}: ${x}`));
  }

  const metrics = candidate?.metrics ?? {};
  const stats = recoveryStats(metrics.recoveryMsSamples ?? []);
  if (stats.p95 === null || stats.p95 > contract.acceptance.recoveryP95MsMax) reasons.push('recovery p95 exceeds gate or missing');
  for (const [field, max] of [
    ['acknowledgedWriteLoss', contract.acceptance.acknowledgedWriteLossMax],
    ['phantomWrites', contract.acceptance.phantomWriteMax],
    ['ackWithoutQuorum', contract.acceptance.ackWithoutQuorumMax],
    ['identitySafetyViolations', contract.acceptance.identitySafetyViolationMax],
    ['provenanceSafetyViolations', contract.acceptance.provenanceSafetyViolationMax],
    ['foreignResourceMutations', contract.acceptance.foreignResourceMutationMax]
  ]) {
    if (!Number.isFinite(metrics[field]) || metrics[field] > max) reasons.push(`${field} failed or missing`);
  }

  const expectedWrites = Number(metrics.acknowledgedWritesBeforeFault ?? 0);
  const reconciledWrites = Number(metrics.acknowledgedWritesAfterHeal ?? -1);
  if (expectedWrites <= 0 || reconciledWrites !== expectedWrites) reasons.push('acknowledged write set did not reconcile exactly');

  return {
    status: reasons.length ? 'FAIL' : contract.acceptance.candidateStatus,
    eligibleForIndependentReconciliation: reasons.length === 0,
    recovery: stats,
    reasons
  };
}
