export const LANGUAGES=Object.freeze(['typescript','python','go','java','dotnet']);
export const MODES=Object.freeze(['legacy','candidate']);
export const SCENARIOS=Object.freeze(['terminal-replay','need-cancel','offer-withdrawal','partial-order-backpressure']);
export function expectedKeys(){
 return new Set(LANGUAGES.flatMap(language=>MODES.flatMap(provider=>MODES.flatMap(requester=>SCENARIOS.map(scenario=>[language,provider,requester,scenario].join('/'))))));
}
export function validateLifecycle(report,context){
 if(report?.schema!=='truyn.five-sdk-lifecycle/v1'||JSON.stringify(report.context)!==JSON.stringify(context))throw Error('lifecycle_context_mismatch');
 const expected=expectedKeys();const rows=report.outcomes;
 if(!Array.isArray(rows)||rows.length!==expected.size)throw Error('lifecycle_missing_cases');
 const seen=new Set();
 for(const r of rows){
  const key=[r.language,r.provider,r.requester,r.scenario].join('/');
  if(!expected.has(key)||seen.has(key))throw Error('lifecycle_duplicate_or_unknown_case');seen.add(key);
  if(!['PASS','FAIL','BLOCKED'].includes(r.status))throw Error('lifecycle_invalid_status');
  if(r.status==='BLOCKED'&&(!Array.isArray(r.missing)||r.missing.length===0))throw Error('lifecycle_unexplained_blocker');
  if(r.status==='PASS'&&(!Number.isSafeInteger(r.assertions)||r.assertions<1||r.missing?.length))throw Error('lifecycle_empty_or_false_pass');
 }
 const checks=report.negotiation;
 const negotiationKeys=new Set(LANGUAGES.flatMap(l=>MODES.map(m=>l+'/'+m)));
 if(!Array.isArray(checks)||checks.length!==10)throw Error('negotiation_missing_cases');
 const nseen=new Set();for(const r of checks){const key=r.language+'/'+r.mode;if(!negotiationKeys.has(key)||nseen.has(key)||!['PASS','FAIL'].includes(r.status))throw Error('negotiation_invalid_case');nseen.add(key);}
 const status=rows.some(r=>r.status==='FAIL')||checks.some(r=>r.status==='FAIL')?'FAIL':rows.some(r=>r.status==='BLOCKED')?'BLOCKED':'PASS';
 if(report.status!==status||report.stableProtocolDeclared!==false||report.productionCutoverAuthorized!==false)throw Error('lifecycle_false_admission');
 return {status,pass:rows.filter(r=>r.status==='PASS').length,blocked:rows.filter(r=>r.status==='BLOCKED').length,fail:rows.filter(r=>r.status==='FAIL').length};
}
