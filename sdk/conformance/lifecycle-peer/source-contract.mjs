import {LANGUAGES,SCENARIOS,validateLifecycle} from './matrix-contract.mjs';
export const SECURITY_SCENARIOS=Object.freeze(['foreign-partial','cancelled-partial-result','tampered-payload','tampered-signature','wrong-event-kind','corrupt-signer']);

// Historical APIs stay blocked where absent. No such exemption applies to a
// successor: twenty lifecycle cells and thirty native security negatives pass.
export function qualifySourceLifecycle(report,context){
 const overall=validateLifecycle(report,context);
 const rows=report.outcomes.filter(r=>r.provider==='candidate'&&r.requester==='candidate');
 const expected=new Set(LANGUAGES.flatMap(l=>SCENARIOS.map(s=>l+'/'+s)));
 if(rows.length!==expected.size||new Set(rows.map(r=>r.language+'/'+r.scenario)).size!==expected.size||rows.some(r=>!expected.has(r.language+'/'+r.scenario)||r.status!=='PASS'))throw Error('source_lifecycle_not_qualified');
 const native=report.capabilities?.filter(r=>r.mode==='candidate');
 if(!Array.isArray(native)||native.length!==LANGUAGES.length||new Set(native.map(r=>r.language)).size!==LANGUAGES.length||native.some(r=>!LANGUAGES.includes(r.language)||r.cancel!==true||r.withdraw!==true||r.partial!==true))throw Error('source_native_api_missing');
 if(report.negotiation.some(r=>r.mode==='candidate'&&r.status!=='PASS'))throw Error('source_negotiation_not_qualified');
 const security=report.sourceSecurity,keys=new Set(LANGUAGES.flatMap(l=>SECURITY_SCENARIOS.map(s=>l+'/'+s)));
 if(!Array.isArray(security)||security.length!==keys.size||new Set(security.map(r=>r.language+'/'+r.scenario)).size!==keys.size||security.some(r=>!keys.has(r.language+'/'+r.scenario)||r.status!=='PASS'||!Number.isSafeInteger(r.assertions)||r.assertions<3))throw Error('source_security_not_qualified');
 return {schema:'truyn.source-native-lifecycle/v1',context,status:'PASS',scenarios:rows.length,securityScenarios:security.length,languages:LANGUAGES,sourceOnly:true,publishedSdkLifecycleStatus:overall.status,publishedBlockedCells:overall.blocked,stableProtocolDeclared:false,productionCutoverAuthorized:false};
}
