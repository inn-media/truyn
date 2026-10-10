import test from 'node:test';
import assert from 'node:assert/strict';
import contract from '../config/f-series-contract.json' with { type: 'json' };
import { validateImpactProofEpisode } from '../benchmarks/f-series/impact-proof.js';
import { recoveryStats, evaluateFSeries } from '../benchmarks/f-series/evaluate.js';
import { appendHashChain, verifyHashChain } from '../benchmarks/f-series/evidence-chain.js';
import { validateFaultDomainPlan } from '../benchmarks/f-series/fault-domain-plan.js';
import { reconcileFSeries } from '../benchmarks/f-series/reconcile.js';
import { requiredFSeriesLease } from '../benchmarks/f-series/lease.js';
import { isDeclaredPhysicalFault } from '../benchmarks/f-series/fault-catalog.js';

const episode = {
  episodeId: 'F2-001',
  mechanism: 'azure_nsg',
  simulated: false,
  azureActivityLogRef: 'activity:F2-001',
  preStateDigest: 'pre',
  duringStateDigest: 'during',
  postHealStateDigest: 'post',
  impactProofs: [
    { source: 'control-plane-readback', value: 'mutation-observed' },
    { source: 'external-observer', value: 'partition-observed' }
  ]
};

test('F contract cannot convert simulation into physical evidence', () => {
  assert.equal(contract.prohibitions.simulationCountsAsPhysicalEvidence, false);
  assert.equal(contract.acceptance.candidateStatus, 'PASS_CANDIDATE');
  assert.equal(contract.acceptance.terminalStatus, 'PASS_RECONCILED');
});

test('physical impact proof requires independent evidence and cloud audit for cloud mutation', () => {
  assert.equal(validateImpactProofEpisode(episode).ok, true);
  assert.equal(validateImpactProofEpisode({ ...episode, azureActivityLogRef: null }).ok, false);
  assert.equal(validateImpactProofEpisode({ ...episode, simulated: true }).ok, false);
});

test('F domain is shared internally but disjoint from foreign benchmark resources', () => {
  const plan = {
    cloud: 'azure',
    dedicatedResourceGroups: ['f-workload', 'f-control'],
    vnetPeeringToForeignBenchmarks: false,
    observerInsideDestructiveDomain: false,
    evidenceStoreInsideDestructiveDomain: false,
    foreignSeriesResourceSelectorsAllowed: false,
    r2LeaseRequired: true
  };
  assert.equal(validateFaultDomainPlan(plan).ok, true);
});

test('p99 is not invented from fewer than 100 recovery samples', () => {
  const stats = recoveryStats([100, 200, 300]);
  assert.equal(stats.p99, null);
  assert.equal(stats.p99Label, 'max_not_percentile');
  assert.equal(stats.max, 300);
});

test('evidence chain detects mutation', () => {
  const chain = appendHashChain([{ a: 1 }, { b: 2 }]);
  assert.equal(verifyHashChain(chain), true);
  chain[1].record.b = 3;
  assert.equal(verifyHashChain(chain), false);
});

test('candidate and reconciliation are separate states', () => {
  const candidate = {
    episodes: [episode],
    metrics: {
      recoveryMsSamples: [10000, 20000, 30000],
      acknowledgedWriteLoss: 0,
      phantomWrites: 0,
      ackWithoutQuorum: 0,
      identitySafetyViolations: 0,
      provenanceSafetyViolations: 0,
      foreignResourceMutations: 0,
      acknowledgedWritesBeforeFault: 100,
      acknowledgedWritesAfterHeal: 100
    }
  };
  assert.equal(evaluateFSeries(candidate, contract).status, 'PASS_CANDIDATE');
  const evidenceChain = appendHashChain([{ episodeId: 'F2-001' }, { metrics: candidate.metrics }]);
  const reconciled = reconcileFSeries({
    candidate,
    contract,
    evidenceChain,
    activityLogIndex: [{ ref: 'activity:F2-001' }],
    independentResourceSnapshot: { faultDomainDeletedOrHealthy: true }
  });
  assert.equal(reconciled.status, 'PASS_RECONCILED');
});

test('F lease and fault catalog are explicit', () => {
  assert.equal(isDeclaredPhysicalFault('wan_partition'), true);
  assert.equal(requiredFSeriesLease('attempt-1').resourceClass, 'R2');
  assert.equal(requiredFSeriesLease('attempt-1').resourceKey, 'f-physical-chaos-fault-domain');
});
