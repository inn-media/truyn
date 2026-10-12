// Read-only, non-admitting separation of the three TRUYN release targets.
// This is not an attestation issuer; synthetic flags cannot grant release rights.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateP13FormatReadiness } from './p13-format-readiness.mjs';
import { evaluateP13ProductionReadiness } from './p13-production-readiness.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const requirements={
 STABLE_TRUYN1_PROTOCOL:[
  'P1_P12_PROTOCOL_CONFORMANCE','P13_FORMAT','P14_RELEASE_DOCUMENTATION',
  'FIVE_EXACT_RELEASED_SDKS','SECURITY_CRYPTO_NEGATIVE_CONFORMANCE',
  'EXACT_SHA_DCO_CI_SECURITY','POSTMERGE_MAIN_INDEPENDENT_ACCEPTANCE'
 ],
 STABLE_TRUYN_SERVICE:[
  'STABLE_TRUYN1_PROTOCOL','P13_OPS','APPLICABLE_PRODUCTION_STATE_MIGRATION_OR_VERIFIED_GREENFIELD',
  'LIVE_BACKUP_PITR_AND_RECOVERY','LIVE_CANARY_AND_ROLLBACK',
  'DEPLOYED_SECURITY_MONITORING','NETWORK_28_DAY_SLO'
 ],
 TRUYN_MAINNET:[
  'STABLE_TRUYN_SERVICE','MAINNET_GOVERNANCE_ADMISSION','LONG_DURATION_LIVE_SECURITY_AND_RELIABILITY'
 ]
};
const excluded=['P13_OPS','PRODUCTION_STATE_MIGRATION','LIVE_PITR_CANARY_ROLLBACK','NETWORK_28_DAY_SLO'];
const equal=(a,b)=>a.length===b.length && new Set(a).size===a.length && b.every(x=>a.includes(x));
export function evaluateReleaseScopes(plan,{formatPlan=read('spec/compatibility/p13-format-compatibility-plan.json'),
 opsPlan=read('operations/p13-production-cutover-plan.json')}={}) {
 if(plan?.schema!=='truyn.stable-release-scopes/v1'
   || plan.status!=='RELEASE_CANDIDATE_ONLY'
   || plan.sourceOfTruth!=='spec/protocol/v1/migration.md'
   || !Array.isArray(plan.declarations)
   || plan.declarations.length!==3
   || typeof plan.operationalMigrationRule!=='string'
   || !plan.operationalMigrationRule.includes('greenfield'))throw new Error('p13_invalid_release_scopes');
 const map=new Map(plan.declarations.map(x=>[x.id,x]));
 if(map.size!==3 || Object.keys(requirements).some(id=>!map.has(id)))throw new Error('p13_incomplete_release_scope');
 for (const [id,need] of Object.entries(requirements)){
   const d=map.get(id);
   if(d.status!=='NOT_DECLARED'||!Array.isArray(d.dependsOn)||!equal(d.dependsOn,need))
     throw new Error('p13_release_requirement_drift:'+id);
 }
 const proto=map.get('STABLE_TRUYN1_PROTOCOL');
 if(!equal(proto.doesNotRequire,excluded)||
   proto.dependsOn.some(x=>excluded.includes(x))||
   !map.get('STABLE_TRUYN_SERVICE').dependsOn.includes('P13_OPS')||
   !map.get('TRUYN_MAINNET').dependsOn.includes('STABLE_TRUYN_SERVICE'))
   throw new Error('p13_release_boundary_violation');
 const format=evaluateP13FormatReadiness(formatPlan);
 const ops=evaluateP13ProductionReadiness(opsPlan);
 return {
   schema:'truyn.stable-release-scopes-readiness/v1',
   protocol:{scope:'STABLE_TRUYN1_PROTOCOL',status:'NOT_ADMITTED',formatStatus:format.status,required:proto.dependsOn},
   service:{scope:'STABLE_TRUYN_SERVICE',status:'BLOCKED',opsStatus:ops.status,required:map.get('STABLE_TRUYN_SERVICE').dependsOn},
   mainnet:{scope:'TRUYN_MAINNET',status:'BLOCKED',required:map.get('TRUYN_MAINNET').dependsOn},
   productionCutoverAuthorized:false,
   stableProtocolDeclared:false,
   stableServiceDeclared:false,
   mainnetDeclared:false,
   next:'Qualify protocol P1-P14 and five SDKs at exact revision independently; verify P13-OPS and live SLO separately for production.'
 };
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 process.stdout.write(JSON.stringify(evaluateReleaseScopes(read('spec/compatibility/stable-release-scopes.json')),null,2)+'\n');
}
