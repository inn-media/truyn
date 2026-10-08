import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLASS_D_1000_THRESHOLDS as D } from '../benchmarks/scale/class-d.js';
import { evaluateSoak, sampleHash, RESOURCE_METRICS } from '../assurance/evaluate-soak.mjs';
import { createHash } from 'node:crypto';

const contract = JSON.parse(readFileSync(new URL('../assurance/contract.json', import.meta.url),'utf8'));
const hex = n => 'a'.repeat(n);
const hash = s => createHash('sha256').update(s).digest('hex');
const start = Date.parse('2026-10-08T00:00:00Z');
function fixture() {
 const manifest = {
  schema:'truyn.assurance.soak-evidence.v1', rung:'1h', seconds:3600,
  topology:contract.soak.topology, sourceSha:hex(40), treeSha:hex(40),
  runtimeSha256:hex(64), runAttempt:1, runId:'fixture-only',
  d1000RunId:contract.d1000Reference.runId,d1000RunAttempt:2,
  startUtc:new Date(start).toISOString(),endUtc:new Date(start+3600000).toISOString(),
  sampleIntervalSeconds:60,limitsFrozenBeforeUtc:new Date(start-1000).toISOString(),
  resourceLimits:Object.fromEntries(RESOURCE_METRICS.map(k=>[k,{ceiling:200,maxPositiveSlopePerHour:0}]))
 };
 const hosts = [0,1,2,3].map(i=>({id:'host-'+i,cloud:i<2?'azure':'gcp',metrics:Object.fromEntries(RESOURCE_METRICS.map(k=>[k,100]))}));
 const samples=[];
 let prev=hash(JSON.stringify(manifest));
 for(let i=0;i<60;i++){
  const sample={utc:new Date(start+(i+1)*60000).toISOString(),previousHash:prev,
   routing:{baselineRatio:0.99,healedRatio:0.99,convergenceP95Ms:120000},
   network:{realProcesses:32,distinctQuicEndpoints:32,replicationFactor:3},
   safety:{acknowledgedWriteLoss:0,invalidSignedAccepted:0,staleReceiptAccepted:0,unauthorizedExecutions:0},
   hosts:structuredClone(hosts)};
  sample.hash=sampleHash(prev,sample); prev=sample.hash; samples.push(sample);
 }
 return {manifest,samples,events:{churn:{real:true,recoveryP95Ms:120000,postRestartRatio:0.99,applicationRetries:0},partitionHeal:{realUdpQuic:true,blockedPathSuccesses:0,healedRatio:0.99}},durability:{hourZeroWriteReadableAtEnd:true,confirmedMissingWrites:0,acknowledgedWriteLoss:0}};
}
function rehash(e) { let prev=hash(JSON.stringify(e.manifest)); for(const s of e.samples){s.previousHash=prev;s.hash=sampleHash(prev,s);prev=s.hash;} }
test('rungs and D accepted floors are frozen, independent of 1000-node density',()=>{
 assert.deepEqual(contract.soak.rungs.map(x=>x.name),['1h','3h','6h','24h','72h','7d','30d']);
 assert.deepEqual(contract.soak.rungs.map(x=>x.mode),['github-hosted','github-hosted','detached-vm','detached-vm','detached-vm','detached-vm','detached-vm']);
 assert.equal(contract.soak.topology.processes,32);
 assert.equal(D.baselineRoutingSuccess,0.99);assert.equal(D.healedRoutingSuccess,0.99);
 assert.equal(D.convergenceP95Ms,120000);assert.equal(D.recoveryP95Ms,120000);
 assert.equal(contract.wire.canonicalObjects.length,13);
});
test('complete synthetic-looking fixture is only REVIEW_REQUIRED, never an accepted terminal',()=>{
 const r=evaluateSoak(fixture(),contract);
 assert.equal(r.status,'REVIEW_REQUIRED',r.failed.join(','));
 assert.equal(r.admission,'NOT_ACCEPTED');
 assert.equal(JSON.stringify(r).includes('TERMINAL'),false);
});
test('missing/weak drift limit cannot silently pass',()=>{
 const e=fixture();delete e.manifest.resourceLimits.rssBytes; rehash(e);
 assert.equal(evaluateSoak(e,contract).status,'FAIL');
});
test('missing host sampling and monotonic growth fail even with all routes green',()=>{
 const e=fixture();
 e.samples[59].hosts[0].metrics.fdCount=150; rehash(e);
 assert.equal(evaluateSoak(e,contract).status,'FAIL');
});
test('one 98% routing sample fails even with good mean',()=>{
 const e=fixture();e.samples[1].routing.healedRatio=0.98;rehash(e);
 assert.ok(evaluateSoak(e,contract).failed.includes('routing_floor_at_sample'));
});
test('a missing/delayed sample and a tampered hash chain cannot PASS',()=>{
 const e=fixture();e.samples.splice(1,1);
 assert.equal(evaluateSoak(e,contract).status,'FAIL');
 const t=fixture();t.samples[1].hosts[0].metrics.heapBytes=2;
 assert.ok(evaluateSoak(t,contract).failed.includes('broken_hash_chain'));
});
test('missing real partition and hour-zero durability fail closed',()=>{
 const e=fixture();e.events.partitionHeal.realUdpQuic=false;e.durability.hourZeroWriteReadableAtEnd=false;
 const r=evaluateSoak(e,contract);assert.ok(r.failed.includes('real_partition_heal'));assert.ok(r.failed.includes('durable_hour_zero_proof'));
});
