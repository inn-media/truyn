import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(p,'utf8');
const report=read('docs/benchmarks/S_SERIES_S200_2026-10-12.md');
const evidence=JSON.parse(read('docs/benchmarks/evidence/S_SERIES_S200_2026-10-12.json'));
test('S-200 2026-10-12 composite scope and cryptographic identities cannot be silently broadened',()=>{
 assert.equal(evidence.status,'PASS_CLOSED_SIX_PROVIDER_COMPOSITE');
 assert.equal(evidence.contractSevenProviderStatus,'OPEN_DEEPSEEK_NOT_MEASURED');
 assert.equal(evidence.homogeneousSingleRunStatus,'NOT_PROVEN');
 assert.equal(evidence.independentWANStatus,'NOT_PROVEN');
 assert.equal(evidence.nodeTarget,200);
 assert.deepEqual(evidence.providerFamilies,['GPT','Gemini','Grok','Llama','Mistral','Kimi']);
 assert.deepEqual(Object.values(evidence.scenarioStatus),Array(8).fill('PASS'));
 assert.equal(evidence.evidence.attempt14.runId,38156585322);
 assert.equal(evidence.evidence.attempt14.workflowConclusion,'failure');
 assert.equal(evidence.evidence.attempt15.runId,38171454872);
 assert.equal(evidence.evidence.attempt15.workflowConclusion,'success');
 assert.equal(evidence.evidence.attempt15.composite,true);
 assert.equal(evidence.evidence.attempt15.oneRunProof,false);
 assert.equal(evidence.evidence.attempt15.artifactId,11716792652);
 assert.equal(evidence.evidence.attempt15.sha256,'cd19392f0c04f8f60f41bc3ec7ae1e7c7007d26f365238c9007833ce2a49a1a2');
 assert.equal(evidence.mix.observations,600);
 assert.equal(evidence.mix.correct,600);
 assert.ok(evidence.economics.inputTokenReductionPct>99);
 assert.ok(evidence.costRouting.comparativeSavingsPct<0);
 assert.ok(evidence.economics.truynP95Ms>evidence.economics.directP95Ms);
 assert.match(report,/DeepSeek was excluded/);
 assert.match(report,/loopback relay/);
 assert.match(report,/nor a single-run/);
});
test('S-200 canonical status, roadmap, indexes and seven-vendor contract remain in sync',()=>{
 for(const path of ['README.md','ROADMAP.md','docs/README.md','docs/architecture/IMPLEMENTATION_STATUS.md',
  'docs/architecture/SEMANTIC_SCALE_S_SERIES.md','docs/benchmarks/README.md',
  'docs/operations/S_SERIES_EXECUTION_AND_TELEMETRY.md']) {
   const s=read(path);assert.match(s,/S-200/,path);assert.match(s,/S_SERIES_S200_DOUBLE_CHECK_2026-10-13\.md/,path);
 }
 const dc=JSON.parse(read('docs/benchmarks/evidence/S_SERIES_S200_DOUBLE_CHECK_2026-10-13.json'));
 assert.equal(dc.status,'PASS_CLOSED_SIX_PROVIDER_DOUBLE_CHECK_VERIFIED');
 assert.equal(dc.doubleCheck.attempt,17);
 assert.equal(dc.doubleCheck.allScenariosFresh,true);
 assert.equal(dc.doubleCheck.historicalEvidenceAdopted,false);
 const contract=read('docs/benchmarks/SEMANTIC_SCALE_S_SERIES_CONTRACT.md');
 assert.match(contract,/A full S-Series gate uses all seven text-provider families/);
 assert.match(contract,/\- DeepSeek;/);
 assert.match(contract,/seven-provider.*OPEN/i);
 const primary=read('docs/operations/S_SERIES_SANITATION_2026-10-12.md');
 assert.match(primary,/seven-provider/);
 assert.match(read('docs/architecture/IMPLEMENTATION_STATUS.md'),/S-200 six-provider 8\/8 PASS \/ CLOSED \/ DOUBLE-CHECK VERIFIED/);
});
