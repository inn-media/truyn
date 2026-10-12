import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateP13ProductionReadiness } from '../scripts/p13-production-readiness.mjs';

const plan=JSON.parse(readFileSync(new URL('../operations/p13-production-cutover-plan.json',import.meta.url),'utf8'));

test('P13 inventory enumerates ten durable domains and ten live cutover gates',()=>{
  const report=evaluateP13ProductionReadiness(plan);
  assert.equal(report.status,'BLOCKED');
  assert.equal(report.lane,'PRODUCTION_OPERATIONS');
  assert.equal(report.formatCompatibilityCertifiedByThisReport,false);
  assert.equal(report.cutoverAuthorized,false);
  assert.equal(report.productionMutationsPerformed,false);
  assert.equal(report.domainCount,10);
  assert.equal(report.requiredPhaseCount,10);
  assert.ok(report.blockers.includes('stable_TRUYN_1_not_declared'));
  assert.ok(report.blockers.includes('protocol_generation_bridge_not_implemented'));
  assert.ok(report.blockers.includes('real_source_snapshot_digest_revision_unverified'));
  for(const d of plan.domains) assert.ok(report.blockers.includes('missing_domain_proof:'+d.id));
});
test('arbitrarily fabricated all-success JSON never becomes live production approval',()=>{
  const evidence={
    source:{authoritative:true,digest:'a'.repeat(64),revision:7},
    phases:plan.phases.map((p,i)=>({id:p.id,verified:true,runId:100+i})),
    domains:plan.domains.map((d,i)=>({id:d.id,snapshot:true,backup:true,rollback:true,negativeTests:true,runId:200+i}))
  };
  const report=evaluateP13ProductionReadiness(plan,evidence);
  assert.equal(report.status,'BLOCKED');
  assert.equal(report.cutoverAuthorized,false);
});
test('missing a domain or evidence becomes hard failure rather than silent omission',()=>{
  assert.throws(()=>evaluateP13ProductionReadiness({...plan,domains:plan.domains.slice(1)}),/p13_incomplete_source/);
  const r=evaluateP13ProductionReadiness(plan,{source:{authoritative:true,digest:'broken',revision:0}});
  assert.ok(r.blockers.includes('real_source_snapshot_digest_revision_unverified'));
  assert.ok(r.blockers.includes('missing_live_phase:isolated-pitr-restore'));
});

test('P13-OPS cannot claim FORMAT ownership even if its other proof flags are set',()=>{
  assert.throws(()=>evaluateP13ProductionReadiness({...plan,lane:'FORMAT'}),/p13_invalid_cutover_contract/);
});
