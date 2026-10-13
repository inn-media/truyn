import test from 'node:test';
import assert from 'node:assert/strict';
import {TruynNode} from '../node/client.js';
import {verifyTerminalRace} from '../sdk/conformance/lifecycle-peer/race-evidence.mjs';
import {readFileSync} from 'node:fs';
function fixture(resultWins=true){
 const provider=new TruynNode({relayUrl:'http://127.0.0.1:1'}),requester=new TruynNode({relayUrl:'http://127.0.0.1:1'}),needId='race-fixture';
 return {needId,provider:provider.identity.nodeId,requester:requester.identity.nodeId,
 terminalState:resultWins?'completed':'cancelled',rpc:[{ok:resultWins},{ok:!resultWins}],
 providerTrace:[{method:'POST',path:'/v1/results',bytes:JSON.stringify({envelope:provider.envelope('RESULT',{requestId:needId,output:{answer:42},completedAt:new Date().toISOString()})}),status:resultWins?200:409,reply:resultWins?{ok:true}:{error:'request_cancelled'}}],
 requesterTrace:[{method:'POST',path:'/v1/revoke',bytes:JSON.stringify({envelope:requester.envelope('REVOKE',{targetId:needId,targetKind:'need',reason:'fixture'})}),status:resultWins?409:200,reply:resultWins?{error:'request_already_completed'}:{ok:true}}]};
}
test('both legitimate terminal race outcomes require signed correlated relay requests and exact 200/409',()=>{
 for(const wins of [true,false]){const f=fixture(wins);assert.equal(verifyTerminalRace(f).terminalState,f.terminalState);}
});
test('local actor failure and missing contender cannot create false terminal-race evidence',()=>{
 for(const key of ['providerTrace','requesterTrace']){const f=fixture();f[key]=[];assert.throws(()=>verifyTerminalRace(f));}
 for(const status of [0,401,403,500,503]){const f=fixture();f.requesterTrace[0].status=status;assert.throws(()=>verifyTerminalRace(f));}
 const f=fixture();f.rpc[1].ok=true;assert.throws(()=>verifyTerminalRace(f));
});
test('wrong request, forged bytes, duplicate traffic and terminal mismatch fail closed',()=>{
 for(const change of [f=>{f.needId='foreign';},f=>{f.provider=f.requester;},f=>{f.providerTrace.push(f.providerTrace[0]);},f=>{f.terminalState='cancelled';},f=>{f.requesterTrace[0].reply.error='unrelated_conflict';},f=>{const e=JSON.parse(f.providerTrace[0].bytes);e.envelope.payload.output={tampered:true};f.providerTrace[0].bytes=JSON.stringify(e);}]){const f=fixture();change(f);assert.throws(()=>verifyTerminalRace(f));}
});
test('actual five-SDK runner records trace offsets before race and invokes the independent validator',()=>{
 const s=readFileSync(new URL('../sdk/conformance/lifecycle-peer/run-lifecycle.mjs',import.meta.url),'utf8');
 assert.match(s,/const pStart=p\.trace\.length,rStart=r\.trace\.length/);
 assert.match(s,/providerTrace:p\.trace\.slice\(pStart\)/);
 assert.match(s,/requesterTrace:r\.trace\.slice\(rStart\)/);
 assert.match(s,/verifyTerminalRace\(/);
});
