import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateReleaseScopes} from '../scripts/p13-release-scopes-readiness.mjs';
const plan=JSON.parse(readFileSync(new URL('../spec/compatibility/stable-release-scopes.json',import.meta.url),'utf8'));
const mutate=(id,fn)=>({...plan,declarations:plan.declarations.map(x=>x.id===id?fn({...x,dependsOn:[...x.dependsOn]}):x)});
test('stable protocol release does not inherit live production/28-day SLO, service and mainnet do',()=>{
 const r=evaluateReleaseScopes(plan);
 assert.equal(r.protocol.status,'NOT_ADMITTED');
 assert.equal(r.protocol.formatStatus,'PRE_STABLE');
 assert.equal(r.service.status,'BLOCKED');
 assert.equal(r.service.opsStatus,'BLOCKED');
 assert.equal(r.mainnet.status,'BLOCKED');
 assert.equal(r.productionCutoverAuthorized,false);
 assert.equal(r.stableProtocolDeclared,false);
 assert.equal(r.stableServiceDeclared,false);
 assert.equal(r.mainnetDeclared,false);
});
test('accidentally requiring PITR or P13-OPS for protocol-only release is contract drift',()=>{
 for(const extraneous of ['P13_OPS','LIVE_PITR_CANARY_ROLLBACK','NETWORK_28_DAY_SLO'])
   assert.throws(()=>evaluateReleaseScopes(mutate('STABLE_TRUYN1_PROTOCOL',x=>({...x,dependsOn:[...x.dependsOn,extraneous]}))),/p13_release_requirement_drift/);
});
test('removing operational security and recovery gates fails closed',()=>{
 for (const required of ['P13_OPS','LIVE_BACKUP_PITR_AND_RECOVERY','LIVE_CANARY_AND_ROLLBACK','NETWORK_28_DAY_SLO'])
   assert.throws(()=>evaluateReleaseScopes(mutate('STABLE_TRUYN_SERVICE',x=>({...x,dependsOn:x.dependsOn.filter(k=>k!==required)}))),/p13_release_requirement_drift/);
});
test('declarations, missing gate, synthetic green, and greenfield permission cannot self-authorize releases',()=>{
 assert.throws(()=>evaluateReleaseScopes(mutate('STABLE_TRUYN1_PROTOCOL',x=>({...x,status:'PASS'}))),/p13_release_requirement_drift/);
 assert.throws(()=>evaluateReleaseScopes(mutate('TRUYN_MAINNET',x=>({...x,dependsOn:[]}))),/p13_release_requirement_drift/);
 assert.throws(()=>evaluateReleaseScopes({...plan,status:'STABLE'}),/p13_invalid_release_scopes/);
 const r=evaluateReleaseScopes({...plan,claimedVerified:true,cutoverAuthorized:true});
 assert.equal(r.productionCutoverAuthorized,false);
 assert.equal(r.stableProtocolDeclared,false);
});
test('canonical policy, roadmap and P13 ownership must preserve independent release scope',()=>{
 const s=readFileSync(new URL('../spec/protocol/v1/migration.md',import.meta.url),'utf8');
 const r=readFileSync(new URL('../ROADMAP.md',import.meta.url),'utf8');
 assert.match(s,/180 calendar days/i);
 assert.match(s,/P13-OPS is not/);
 assert.match(r,/P13-OPS, Azure\/Cosmos production state migration/);
 assert.match(r,/Stable TRUYN Service/);
});
