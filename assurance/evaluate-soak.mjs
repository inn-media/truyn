#!/usr/bin/env node
// Offline pre-admission evaluator only. Never emits a canonical accepted A-Series terminal.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CLASS_D_1000_THRESHOLDS as D } from '../benchmarks/scale/class-d.js';

const sha = value => createHash('sha256').update(value).digest('hex');
const finite = v => typeof v === 'number' && Number.isFinite(v);
const hex = (s, n) => typeof s === 'string' && new RegExp('^[a-f0-9]{' + n + '}$').test(s);
export const RESOURCE_METRICS = Object.freeze(['rssBytes', 'heapBytes', 'fdCount', 'dhtEntries', 'diskBytes']);
export function sampleHash(previousHash, sample) {
  const { hash, ...payload } = sample;
  return sha(previousHash + '\n' + JSON.stringify(payload));
}
export function evaluateSoak(evidence, contract) {
  const failed = [];
  const fail = (s) => { if (!failed.includes(s)) failed.push(s); };
  const m = evidence?.manifest;
  const samples = evidence?.samples;
  const config = contract?.soak;
  if (!m || !config || !Array.isArray(samples)) return { status:'FAIL', failed:['invalid_evidence'], admission:'NOT_ACCEPTED' };
  const rung = config.rungs?.find(x => x.name === m.rung);
  if (!rung || m.seconds !== rung.seconds) fail('frozen_rung');
  const topo = config.topology || {};
  if (JSON.stringify(m.topology) !== JSON.stringify(topo) || topo.processes !== 32 ||
      topo.azureVMs !== 2 || topo.gcpVMs !== 2 || topo.replicationFactor !== 3) fail('real_crosscloud_topology');
  if (m.schema !== 'truyn.assurance.soak-evidence.v1' ||
      !hex(m.sourceSha,40) || !hex(m.treeSha,40) || !hex(m.runtimeSha256,64) ||
      !Number.isInteger(m.runAttempt) || m.runAttempt < 1 || !String(m.runId || '').trim()) fail('frozen_identity');
  if (m.d1000RunId !== contract.d1000Reference?.runId || m.d1000RunAttempt !== contract.d1000Reference?.runAttempt) fail('d1000_pin');
  if (!Number.isInteger(m.sampleIntervalSeconds) || m.sampleIntervalSeconds !== config.sampleIntervalSeconds) fail('sampling_contract');
  const start = Date.parse(m.startUtc), end = Date.parse(m.endUtc);
  if (!finite(start) || !finite(end) || end - start < (rung?.seconds || Infinity) * 1000) fail('elapsed_window');
  if (!m.limitsFrozenBeforeUtc || !finite(Date.parse(m.limitsFrozenBeforeUtc)) || Date.parse(m.limitsFrozenBeforeUtc) > start) fail('limits_not_prefrozen');
  const limits = m.resourceLimits;
  for (const metric of RESOURCE_METRICS) {
    const l = limits?.[metric];
    if (!finite(l?.ceiling) || l.ceiling <= 0 || !finite(l?.maxPositiveSlopePerHour) ||
        l.maxPositiveSlopePerHour < 0) fail('missing_resource_limit:' + metric);
  }
  if (samples.length < 3) fail('insufficient_samples');
  const hosts = new Map();
  let previousHash = sha(JSON.stringify(m));
  let lastTimestamp = start;
  for (let i=0; i<samples.length; i++) {
    const s=samples[i], t=Date.parse(s?.utc);
    if (!finite(t) || t <= lastTimestamp || t > end ||
        (i===0 ? t-start : t-lastTimestamp) > 1.5 * m.sampleIntervalSeconds * 1000) fail('sample_gap_or_clock');
    if (s?.previousHash !== previousHash || s?.hash !== sampleHash(previousHash, s)) fail('broken_hash_chain');
    previousHash = s?.hash;
    lastTimestamp = t;
    const r=s?.routing||{}, safety=s?.safety||{};
    if (s?.network?.realProcesses !== 32 || s?.network?.distinctQuicEndpoints !== 32 ||
        s?.network?.replicationFactor !== 3) fail('live_network_coverage');
    if (!finite(r.baselineRatio) || r.baselineRatio < D.baselineRoutingSuccess ||
        !finite(r.healedRatio) || r.healedRatio < D.healedRoutingSuccess) fail('routing_floor_at_sample');
    if (!finite(r.convergenceP95Ms) || r.convergenceP95Ms > D.convergenceP95Ms) fail('convergence_floor_at_sample');
    if (safety.acknowledgedWriteLoss !== 0 || safety.invalidSignedAccepted !== 0 ||
        safety.staleReceiptAccepted !== 0 || safety.unauthorizedExecutions !== 0) fail('safety_at_sample');
    if (!Array.isArray(s?.hosts) || s.hosts.length !== 4) { fail('missing_hosts'); continue; }
    const currentKeys = new Set();
    for (const h of s.hosts) {
      if (!h || !['azure','gcp'].includes(h.cloud) || !String(h.id || '').trim() || currentKeys.has(h.id)) {fail('invalid_host_identity');continue;}
      currentKeys.add(h.id);
      if (!hosts.has(h.id)) hosts.set(h.id, {cloud:h.cloud,points:[]});
      const trace=hosts.get(h.id);
      if (trace.cloud !== h.cloud) fail('host_moved_cloud');
      trace.points.push({t,values:h.metrics||{}});
      for (const metric of RESOURCE_METRICS) {
        const value=h.metrics?.[metric], ceiling=limits?.[metric]?.ceiling;
        if (!finite(value) || value < 0 || (finite(ceiling) && value > ceiling)) fail('resource_ceiling_or_missing:' + metric);
      }
    }
    if (currentKeys.size !== 4 || [...currentKeys].filter(k=>hosts.get(k)?.cloud==='azure').length !== 2 ||
        [...currentKeys].filter(k=>hosts.get(k)?.cloud==='gcp').length !== 2) fail('cloud_host_coverage');
  }
  if (lastTimestamp < end - m.sampleIntervalSeconds * 1000) fail('end_window_gap');
  if (hosts.size !== 4) fail('host_set_inconsistent');
  for (const [id, trace] of hosts) {
    if (trace.points.length !== samples.length) fail('host_missing_sample');
    for (const metric of RESOURCE_METRICS) {
      const p=trace.points;
      if (p.length<3 || p.some(x=>!finite(x.values[metric]))) continue;
      const x=p.map(a=>(a.t-p[0].t)/3600000), y=p.map(a=>a.values[metric]);
      const meanX=x.reduce((a,b)=>a+b,0)/x.length, meanY=y.reduce((a,b)=>a+b,0)/y.length;
      const denom=x.reduce((a,b)=>a+(b-meanX)**2,0);
      if (denom===0) {fail('drift_coverage:' + metric);continue;}
      const slope=x.reduce((a,b,i)=>a+(b-meanX)*(y[i]-meanY),0)/denom;
      if (finite(limits?.[metric]?.maxPositiveSlopePerHour) && slope > limits[metric].maxPositiveSlopePerHour) fail('positive_resource_drift:' + metric);
    }
  }
  if (evidence?.events?.churn?.real !== true || !finite(evidence.events.churn.recoveryP95Ms) ||
      evidence.events.churn.recoveryP95Ms > D.recoveryP95Ms ||
      !finite(evidence.events.churn.postRestartRatio) ||
      evidence.events.churn.postRestartRatio < D.baselineRoutingSuccess ||
      evidence.events.churn.applicationRetries !== 0) fail('real_churn_recovery');
  if (evidence?.events?.partitionHeal?.realUdpQuic !== true ||
      evidence.events.partitionHeal.blockedPathSuccesses !== 0 ||
      !finite(evidence.events.partitionHeal.healedRatio) ||
      evidence.events.partitionHeal.healedRatio < D.healedRoutingSuccess) fail('real_partition_heal');
  if (evidence?.durability?.hourZeroWriteReadableAtEnd !== true ||
      evidence.durability.confirmedMissingWrites !== 0 ||
      evidence.durability.acknowledgedWriteLoss !== 0) fail('durable_hour_zero_proof');
  return {
    status: failed.length ? 'FAIL' : 'REVIEW_REQUIRED',
    failed,
    sampleCount: samples.length,
    sourceSha: m.sourceSha || null,
    runId: m.runId || null,
    // The machine-checkable offline result is necessary, never sufficient: independent
    // public-cloud attestation, cost/cleanup evidence and operator approval required.
    admission: 'NOT_ACCEPTED'
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const contract=JSON.parse(readFileSync(new URL('./contract.json', import.meta.url),'utf8'));
    const evidence=JSON.parse(readFileSync(process.argv[2], 'utf8'));
    const result=evaluateSoak(evidence, contract);
    process.stdout.write(JSON.stringify(result) + '\n');
    if(result.status==='FAIL') process.exitCode=1;
  } catch(e) { console.error(e.message); process.exitCode=2; }
}
