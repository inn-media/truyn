import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateP13FormatReadiness } from '../scripts/p13-format-readiness.mjs';
import { evaluateP13ProductionReadiness } from '../scripts/p13-production-readiness.mjs';

const formatPlan = JSON.parse(readFileSync(new URL('../spec/compatibility/p13-format-compatibility-plan.json', import.meta.url), 'utf8'));
const opsPlan = JSON.parse(readFileSync(new URL('../operations/p13-production-cutover-plan.json', import.meta.url), 'utf8'));

test('P13-FORMAT policy and bounded format evidence do not imply stable-v1 or production cutover', () => {
  const report = evaluateP13FormatReadiness(formatPlan);
  assert.equal(report.lane, 'FORMAT');
  assert.equal(report.policyDefined, true);
  assert.equal(report.status, 'PRE_STABLE');
  assert.equal(report.stableFormatCertified, false);
  assert.equal(report.productionCutoverAuthorized, false);
  assert.equal(report.productionEvidenceInspected, false);
  assert.equal(report.stableGatesPending.length, 7);
});

test('P13-FORMAT cannot be self-certified by editing claimed gate statuses', () => {
  const asserted = {
    ...formatPlan, maturity: 'stable',
    stableQualification: formatPlan.stableQualification.map(x => ({ ...x, status: 'PASS' }))
  };
  assert.throws(() => evaluateP13FormatReadiness(asserted), /p13_invalid_format_contract/);
  const shallowAssertion = {...formatPlan, stableQualification: formatPlan.stableQualification.map(x => ({...x,status:'PASS'}))};
  assert.equal(evaluateP13FormatReadiness(shallowAssertion).stableFormatCertified, false);
});

test('incomplete or drifted format contract fails closed', () => {
  assert.throws(() => evaluateP13FormatReadiness({...formatPlan,boundedEvidence:[]}), /p13_incomplete_format_inventory/);
  assert.throws(() => evaluateP13FormatReadiness({...formatPlan,deprecation:{...formatPlan.deprecation,minStableNoticeCalendarDays:90}}),/p13_invalid_format_contract/);
  assert.throws(() => evaluateP13FormatReadiness({...formatPlan,stableQualification:formatPlan.stableQualification.slice(1)}),/p13_incomplete_format_inventory/);
});

test('production cutover remains independently BLOCKED even with complete local format inventory', () => {
  const format = evaluateP13FormatReadiness(formatPlan);
  const ops = evaluateP13ProductionReadiness(opsPlan);
  assert.equal(format.policyDefined, true);
  assert.equal(ops.status, 'BLOCKED');
  assert.equal(ops.cutoverAuthorized, false);
  assert.equal(ops.productionMutationsPerformed, false);
});

test('fabricated operational evidence cannot certify formats or enable cutover', () => {
  const opsEvidence = {
    source: { authoritative: true, digest: 'a'.repeat(64), revision: 7 },
    domains: opsPlan.domains.map((x,i) => ({id:x.id,snapshot:true,backup:true,rollback:true,negativeTests:true,runId:i+1})),
    phases: opsPlan.phases.map((x,i) => ({id:x.id,verified:true,runId:i+1}))
  };
  const ops = evaluateP13ProductionReadiness(opsPlan,opsEvidence);
  assert.equal(ops.cutoverAuthorized,false);
  assert.equal(evaluateP13FormatReadiness(formatPlan).stableFormatCertified,false);
});
