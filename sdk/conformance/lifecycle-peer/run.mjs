#!/usr/bin/env node
import assert from 'node:assert/strict';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRelay} from '../../../network/relay/server.js';
import {LANGUAGES,MODES,SCENARIOS,validateLifecycle} from './matrix-contract.mjs';
import {launchNativePeer} from './native-peer.mjs';
import {SECURITY_SCENARIOS} from './source-contract.mjs';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(sha,process.env.TRUYN_EXPECTED_SOURCE_SHA,'exact lifecycle checkout required');
const context={sourceSha:sha,sourceTree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),runId:Number(process.env.GITHUB_RUN_ID),runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT),event:process.env.GITHUB_EVENT_NAME};
assert.ok(context.runId>0&&context.runAttempt>0);
const evidence=resolve(process.env.RUNNER_TEMP,'five-sdk-evidence');
const packageReport=readFileSync(resolve(evidence,'report.json'));
const prior=JSON.parse(packageReport);assert.deepEqual(prior.context,context);assert.equal(prior.status,'PASS');assert.equal(prior.packages.length,5);
// Real loopback relay and a transparent test-only byte capture proxy. Replay
// uses the original SDK-signed body; it never signs on behalf of a language.
const relay=createRelay({localDevelopmentMode:true,maxQueuedEventsPerNode:2});
const actualUrl=await relay.listen({port:0});const trace=[];
// One bounded hostile-response injection, only for the exact fixture recipient.
// Captured signed bodies and fixture authorization headers never enter evidence.
let tamperNext=null;
const proxy=http.createServer(async(req,res)=>{
 try{
  const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>1048576)throw Error('fixture_request_too_large');chunks.push(c);}
  const raw=Buffer.concat(chunks).toString();const headers={'content-type':'application/json'};
  if(req.headers.authorization)headers.authorization=req.headers.authorization;
  const response=await fetch(actualUrl+req.url,{method:req.method,headers,body:req.method==='GET'?undefined:raw,signal:AbortSignal.timeout(7000)});
  let data=await response.text();
  if(req.method==='POST'){trace.push({path:req.url,raw,headers,status:response.status,error:JSON.parse(data)?.error});if(trace.length>4096)trace.shift();}
  if(tamperNext&&req.method==='GET'&&response.status===200){
   const url=new URL(req.url,actualUrl);
   if(url.pathname==='/v1/fast/events'&&url.searchParams.get('nodeId')===tamperNext.recipient){
    const body=JSON.parse(data);assert.equal(body.events.length,1,'one genuine signed event is required for tamper test');
    const event=body.events[0];assert.equal(event.kind,'PARTIAL');assert.ok(event.frame?.s);
    switch(tamperNext.scenario){
     case 'tampered-payload':event.payload.delta='changed-after-native-signing';break;
     case 'tampered-signature':event.frame.s=(event.frame.s[0]==='A'?'B':'A')+event.frame.s.slice(1);break;
     case 'wrong-event-kind':event.kind='RESULT';break;
     case 'corrupt-signer':event.from=tamperNext.attacker;break;
     default:throw Error('unknown_tamper_case');
    }
    data=JSON.stringify(body);tamperNext=null;
   }
  }
  res.writeHead(response.status,{'content-type':'application/json'});res.end(data);
 }catch{res.writeHead(502,{'content-type':'application/json'});res.end('{"error":"fixture_transport_failure"}');}
});
await new Promise(r=>proxy.listen(0,'127.0.0.1',r));const relayUrl='http://127.0.0.1:'+proxy.address().port;
const outcomes=[],negotiation=[],capabilities=[],sourceSecurity=[];const children=[];

let ordinal=0;
try{
for(const language of LANGUAGES){
 const peers=Object.fromEntries(MODES.map(mode=>[mode,launchNativePeer(language,mode,relayUrl)]));
 for(const peer of Object.values(peers))children.push(peer.child);
 const traits={};
 try{
  for(const mode of MODES){
   const response=await peers[mode].call('connect',{actor:'probe-'+mode});assert.equal(response.ok,true,response.error);traits[mode]=response.value;capabilities.push({language,mode,cancel:response.value.cancel,withdraw:response.value.withdraw,partial:response.value.partial,surface:response.value.surface});
   const before=trace.length;const bad=await peers[mode].call('connect',{actor:'bad-'+mode,protocols:['TRUYN/999']});
   try{assert.equal(bad.ok,false);assert.ok(trace.slice(before).some(x=>x.path==='/v1/register'&&x.status===409));negotiation.push({language,mode,status:'PASS'});}catch(e){negotiation.push({language,mode,status:'FAIL',reason:e.message.slice(0,160)});}
  }
  for(const provider of MODES)for(const requester of MODES)for(const scenario of SCENARIOS){
   const row={language,provider,requester,scenario};let assertions=0;
   const eq=(a,b,n)=>{assertions++;assert.deepEqual(a,b,n);};const ok=(a,n)=>{assertions++;assert.ok(a,n);};
   const missing=[];if(scenario==='need-cancel'&&!traits[requester].cancel)missing.push('requester.cancel');
   if(scenario==='offer-withdrawal'&&!traits[provider].withdraw)missing.push('provider.withdraw');
   if(scenario==='partial-order-backpressure'){if(!traits[provider].partial)missing.push('provider.partial');if(!traits[requester].partial)missing.push('requester.compact-events');}
   if(missing.length){outcomes.push({...row,status:'BLOCKED',missing});continue;}
   const actor='case-'+(++ordinal),p=actor+'-provider',r=actor+'-requester',a=actor+'-attacker',cap='sdk.lifecycle.'+ordinal;
   const P=peers[provider],R=peers[requester];
   const call=async(peer,action,args)=>{const v=await peer.call(action,args);eq(v.ok,true,'native '+action+': '+v.error);return v.value;};
   const denied=async(peer,action,args,status,error)=>{const n=trace.length;const v=await peer.call(action,args);eq(v.ok,false,'SDK must surface relay rejection');const path=action==='result'?'/v1/results':action==='partial'?'/v1/fast/partials':'/v1/revoke';ok(trace.slice(n).some(x=>x.status===status&&x.path===path&&typeof x.error==='string'&&(!error||x.error===error)),'expected '+path+' HTTP '+status);};
   try{
    const pi=await call(P,'connect',{actor:p});await call(R,'connect',{actor:r});await call(R,'connect',{actor:a});
    const offer=await call(P,'offer',{actor:p,capability:cap});
    if(scenario==='partial-order-backpressure'){
     const n=await call(R,'compactNeed',{actor:r,capability:cap});const id=n.needId||n.requestId||n.frame?.i;ok(id,'compact request identity');
     await call(P,'pollCompact',{actor:p});
     await call(P,'partial',{actor:p,needId:id,sequence:0,delta:'a'});
     await call(P,'partial',{actor:p,needId:id,sequence:0,delta:'a'});
     eq(relay.state.requests.get(id).nextPartialSequence,1);
     await denied(P,'partial',{actor:p,needId:id,sequence:0,delta:'conflict'},409);
     await denied(P,'partial',{actor:p,needId:id,sequence:2,delta:'gap'},409);
     await call(P,'partial',{actor:p,needId:id,sequence:1,delta:'b'});
     await denied(P,'partial',{actor:p,needId:id,sequence:2,delta:'c'},429);
     eq(relay.state.requests.get(id).nextPartialSequence,2,'backpressure does not advance');
     const chunks=await call(R,'pollCompact',{actor:r});eq(chunks.map(x=>[x.kind,x.sequence,x.verified]),[['PARTIAL',0,true],['PARTIAL',1,true]]);
     await call(P,'partial',{actor:p,needId:id,sequence:2,delta:'c'});await call(R,'pollCompact',{actor:r});
     await call(P,'compactResult',{actor:p,needId:id});
     await denied(P,'partial',{actor:p,needId:id,sequence:3,delta:'late'},409);
     const end=await call(R,'pollCompact',{actor:r});eq(end.map(x=>[x.kind,x.verified]),[['RESULT',true]]);
     eq(relay.state.requests.get(id).status,'completed');
    }else{
     const n=await call(R,'need',{actor:r,capability:cap});const id=n.needId;ok(id);
     const received=await call(P,'nextNeed',{actor:p});eq(received,{needId:id,verified:true});
     const original=trace.findLast(x=>x.path==='/v1/needs'&&JSON.parse(x.raw).envelope.id===id);ok(original);
     const replay=await fetch(relayUrl+'/v1/needs',{method:'POST',headers:original.headers,body:original.raw});eq(replay.status,409);
     eq((await call(P,'poll',{actor:p})).length,0,'replay must not redeliver NEED');
     await denied(R,'result',{actor:a,needId:id},403);
     if(scenario==='need-cancel'){
      await denied(R,'cancel',{actor:a,needId:id},403);
      await call(R,'cancel',{actor:r,needId:id});await call(P,'poll',{actor:p});
      await call(R,'cancel',{actor:r,needId:id});const cancelled=await call(P,'poll',{actor:p});
      eq(cancelled.map(x=>[x.kind,x.verified]),[['REVOKE',true]]);
      await denied(P,'result',{actor:p,needId:id},409);eq(relay.state.requests.get(id).status,'cancelled');
     }else{
      if(scenario==='offer-withdrawal'){
       await call(P,'connect',{actor:a+'-offer'});await denied(P,'withdraw',{actor:a+'-offer',offerId:offer.offerId},403);
       await call(P,'withdraw',{actor:p,offerId:offer.offerId});eq(relay.state.offers.get(offer.offerId).revoked,true);
       const signedOffer=trace.findLast(x=>x.path==='/v1/offers'&&JSON.parse(x.raw).envelope.id===offer.offerId);ok(signedOffer);
       eq((await fetch(relayUrl+'/v1/offers',{method:'POST',headers:signedOffer.headers,body:signedOffer.raw})).status,409,'revoked offer cannot revive');
      }
      await call(P,'result',{actor:p,needId:id});eq(await call(R,'waitResult',{actor:r,needId:id}),{needId:id,verified:true});
      await denied(P,'result',{actor:p,needId:id},409);
      if(traits[requester].cancel)await denied(R,'cancel',{actor:r,needId:id},409);
      eq(relay.state.requests.get(id).status,'completed');eq(relay.state.stats.get(pi.nodeId).successfulTasks,1);
      eq((await call(R,'poll',{actor:r})).length,0,'one terminal delivery');
      eq((await fetch(relayUrl+'/v1/needs',{method:'POST',headers:original.headers,body:original.raw})).status,409,'postsettlement replay refusal');
     }
    }
    outcomes.push({...row,status:'PASS',assertions});console.log('PASS '+[language,provider,requester,scenario].join('/'));
   }catch(e){outcomes.push({...row,status:'FAIL',assertions,reason:e.message.slice(0,200)});console.log('FAIL '+[language,provider,requester,scenario].join('/')+' '+e.message.slice(0,200));}
  }
  // These successor-only negatives are mandatory, not an exemption for old APIs.
  // Every signature is generated/verified by the actual language's SDK.
  for(const scenario of SECURITY_SCENARIOS){
   let assertions=0;const eq=(a,b,n)=>{assertions++;assert.deepEqual(a,b,n);};const ok=(a,n)=>{assertions++;assert.ok(a,n);};
   const peer=peers.candidate,actor='security-'+(++ordinal),p=actor+'-p',r=actor+'-r',a=actor+'-a',cap='sdk.security.'+ordinal;
   const call=async(action,args)=>{const value=await peer.call(action,args);eq(value.ok,true,'native '+action+': '+value.error);return value.value;};
   const denied=async(action,args,status)=>{const n=trace.length;const value=await peer.call(action,args);eq(value.ok,false,'native SDK must reject');const path=action==='partial'?'/v1/fast/partials':'/v1/fast/results';ok(trace.slice(n).some(x=>x.path===path&&x.status===status),'real relay denial required');};
   try{
    await call('connect',{actor:p});const ri=await call('connect',{actor:r}),ai=await call('connect',{actor:a});
    await call('offer',{actor:p,capability:cap});const receipt=await call('compactNeed',{actor:r,capability:cap});const id=receipt.needId||receipt.requestId||receipt.frame?.i;ok(id);
    const need=await call('pollCompact',{actor:p});eq(need.map(x=>[x.kind,x.verified]),[['NEED',true]]);
    if(scenario==='cancelled-partial-result'){
     await call('cancel',{actor:r,needId:id});eq(relay.state.requests.get(id).status,'cancelled');
     await denied('partial',{actor:p,needId:id,sequence:0,delta:'late'},409);
     await denied('compactResult',{actor:p,needId:id},409);
     eq(relay.state.requests.get(id).nextPartialSequence,0);
    }else{
     if(scenario==='foreign-partial'){
      await denied('partial',{actor:a,needId:id,sequence:0,delta:'forged-provider'},403);
      eq(relay.state.requests.get(id).nextPartialSequence,0,'foreign provider cannot advance sequence');
     }
     await call('partial',{actor:p,needId:id,sequence:0,delta:'genuine-native-signed'});
     if(scenario!=='foreign-partial')tamperNext={scenario,recipient:ri.nodeId,attacker:ai.nodeId};
     const polled=await peer.call('pollCompact',{actor:r});
     if(scenario==='foreign-partial'){
      eq(polled.ok,true);eq(polled.value.map(x=>[x.kind,x.sequence,x.verified]),[['PARTIAL',0,true]]);
     }else{
      eq(tamperNext,null,'the hostile response must actually have been injected');
      ok(polled.ok===false||(polled.ok===true&&Array.isArray(polled.value)&&polled.value.length===1&&polled.value[0].verified===false),'tampered event must never be verified by native SDK');
     }
     await call('compactResult',{actor:p,needId:id});const end=await call('pollCompact',{actor:r});
     eq(end.map(x=>[x.kind,x.verified]),[['RESULT',true]],'positive control remains verifiable after hostile event');
    }
    sourceSecurity.push({language,scenario,status:'PASS',assertions});console.log('PASS source-security '+language+'/'+scenario);
   }catch(e){sourceSecurity.push({language,scenario,status:'FAIL',assertions,reason:e.message.slice(0,200)});console.log('FAIL source-security '+language+'/'+scenario+' '+e.message.slice(0,200));}
   finally{tamperNext=null;}
  }
 }finally{for(const peer of Object.values(peers))peer.child.stdin.end();}
}
const status=outcomes.some(r=>r.status==='FAIL')||negotiation.some(r=>r.status==='FAIL')?'FAIL':outcomes.some(r=>r.status==='BLOCKED')?'BLOCKED':'PASS';
const report={schema:'truyn.five-sdk-lifecycle/v1',context,status,packagesReportSha256:createHash('sha256').update(packageReport).digest('hex'),publishedSdkSourceSha:prior.publishedSdkSourceSha,capabilities,outcomes,negotiation,sourceSecurity,stableProtocolDeclared:false,productionCutoverAuthorized:false,scope:'native-available-signed-lifecycle-with-explicit-unsupported-API-blockers',limitations:['Replay resends the original SDK-signed HTTP bytes through a loopback fixture; it does not invent a new SDK retry API.','Missing native APIs are BLOCKED, never PASS or silently omitted.','TypeScript compact sends use its exported runtime signer; other languages are not bridged through TypeScript.','Durable multi-host/third-party effect acceptance and stable package publication are independently outstanding.']};
const counts=validateLifecycle(report,context);writeFileSync(resolve(evidence,'lifecycle.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status,...counts,negotiationCases:10,sourceSecurityPass:sourceSecurity.filter(x=>x.status==='PASS').length,sourceSha:sha}));
if(status==='FAIL'||sourceSecurity.some(x=>x.status!=='PASS'))process.exitCode=1;
}finally{
 for(const child of children){if(child.exitCode===null)child.kill('SIGTERM');}
 await new Promise(r=>proxy.close(r));await relay.close();
}
