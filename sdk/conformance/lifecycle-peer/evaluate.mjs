// Independent coverage validation; this module never issues release authority.
export const LANGUAGES=['typescript','python','go','java','dotnet'];
export const MODES=['published','source'];
export const ORDINARY=['offer-signature','offer-owner','need-replay','need-acceptance-window','durable-replica-replay','durable-restart-replay','cross-transport-replay','cancel-owner','result-owner','withdrawal-preserves-work','result-delivery','duplicate-terminal','cancel-after-result','cancel-idempotent','late-result-after-cancel','replay-after-cancel','terminal-race','version-mismatch'];
export const STREAMING=['sequence-gap','first-partial','identical-retry','conflicting-retry','backpressure','drain-ordered','retry-after-backpressure','terminal-after-stream','late-partial','duplicate-stream-result','foreign-partial','cancel-late-partial'];
export function evaluateLifecycle(report,expected){
 if(report?.schema!=='truyn.five-sdk-lifecycle/v1'||!expected||
 !/^[0-9a-f]{40}$/.test(expected.sourceSha)||!/^[0-9a-f]{40}$/.test(expected.treeSha)||
 !/^[0-9a-f]{64}$/.test(expected.priorPackageProofSha256)||
 ['sourceSha','treeSha','runId','runAttempt','priorPackageProofSha256'].some(k=>String(report[k])!==String(expected[k]))||
 report.stableProtocolDeclared!==false||report.productionCutoverAuthorized!==false||
 !Array.isArray(report.outcomes))throw Error('lifecycle_evidence_context_mismatch');
 const want=new Set();for(const language of LANGUAGES)for(const provider of MODES)for(const requester of MODES)for(const scenario of [...ORDINARY,...STREAMING])want.add([language,provider,requester,scenario].join(':'));
 const observed=new Set(),blockers=[];
 for(const row of report.outcomes){
  const key=[row.language,row.provider,row.requester,row.scenario].join(':');
  if(!want.has(key)||observed.has(key)||!['PASS','FAIL','UNSUPPORTED'].includes(row.status))throw Error('lifecycle_evidence_duplicate_or_unknown_case');
  observed.add(key);if(row.status!=='PASS')blockers.push({case:key,status:row.status,reason:row.reason||'scenario_not_passed'});
 }
 for(const key of want)if(!observed.has(key))blockers.push({case:key,status:'MISSING'});
 return{schema:'truyn.p14.lifecycle-coverage/v1',sourceSha:expected.sourceSha,
  status:blockers.length?'BLOCKED':'PASS',expectedCases:want.size,observedCases:observed.size,
  passed:report.outcomes.filter(r=>r.status==='PASS').length,blockers,
  scope:'P6-P9/P11 published-source lifecycle coverage only; not complete P14 release admission',
  stableProtocolDeclared:false,productionCutoverAuthorized:false};
}
