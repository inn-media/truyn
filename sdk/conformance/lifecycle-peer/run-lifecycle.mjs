#!/usr/bin/env node
// Real verified public/source peers; synthetic local proxy traffic is memory-only.
// No keys, tokens, private topology or raw signed envelopes enter artifacts.
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,delimiter} from 'node:path';
import {createHash} from 'node:crypto';
import {createRelay} from '../../../network/relay/server.js';
import {TruynNode} from '../../../node/client.js';
import {verifyEnvelope} from '../../../core/protocol/index.js';
import {evaluateLifecycle,ORDINARY,STREAMING} from './evaluate.mjs';
import {verifyTerminalRace} from './race-evidence.mjs';
const root=process.cwd(),here=resolve(root,'sdk/conformance/lifecycle-peer');
const evidence=process.env.TRUYN_LIFECYCLE_EVIDENCE_DIR;
assert.ok(evidence,'TRUYN_LIFECYCLE_EVIDENCE_DIR is required');mkdirSync(evidence,{recursive:true});
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const tree=execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim();
assert.equal(source,process.env.TRUYN_EXPECTED_SOURCE_SHA,'never qualify a synthetic PR merge as source head');
const priorBytes=readFileSync(join(evidence,'report.json')),prior=JSON.parse(priorBytes);
assert.equal(prior.schema,'truyn.five-sdk-exact-interop-evidence/v1');assert.equal(prior.status,'PASS');
assert.equal(prior.context.sourceSha,source);assert.equal(prior.context.sourceTree,tree);
assert.equal(String(prior.context.runId),process.env.GITHUB_RUN_ID);assert.equal(String(prior.context.runAttempt),process.env.GITHUB_RUN_ATTEMPT);
assert.equal(prior.caseCount,20);assert.equal(prior.packages.length,5);
const sha256=b=>createHash('sha256').update(b).digest('hex');
const temp=mkdtempSync(join(tmpdir(),'truyn-lifecycle-'));
const rows=[],surfaces=[],languages=['typescript','python','go','java','dotnet'],modes=['published','source'];
const ordinary=ORDINARY,streaming=STREAMING,built=new Map();
function build(command,args,cwd=root){execFileSync(command,args,{cwd,stdio:'inherit',timeout:180000});}
try {
 for(const mode of modes){
  const old=mode==='published',sub=old?'legacy':'candidate';
  const goDir=join(temp,'go-'+mode);mkdirSync(goDir);
  for(const f of ['go.mod','go.sum']){try{writeFileSync(join(goDir,f),readFileSync('/tmp/truyn-wire-go-'+sub+'/'+f));}catch(e){if(f==='go.mod')throw e;}}
  writeFileSync(join(goDir,'main.go'),readFileSync(join(here,'actor.go')));
  const goExe=join(goDir,'actor');build('go',['build','-mod=readonly','-o',goExe,'.'],goDir);
  built.set('go:'+mode,{command:goExe,args:[]});
  const javaDir=join(temp,'java-'+mode);mkdirSync(javaDir);
  const cp=old?process.env.TRUYN_LEGACY_JAVA_CP:process.env.TRUYN_CANDIDATE_JAVA_CP;
  assert.ok(cp,'verified Java classpath required');build('javac',['-cp',cp,'-d',javaDir,join(here,'LifecycleActor.java')]);
  built.set('java:'+mode,{command:'java',args:['-cp',javaDir+delimiter+cp,'org.truyn.sdk.LifecycleActor']});
  const dotnetDir=join(temp,'dotnet-'+mode);mkdirSync(dotnetDir);
  writeFileSync(join(dotnetDir,'Program.cs'),readFileSync(join(here,'LifecycleActor.cs')));
  const reference=old?'<PackageReference Include="Truyn.Sdk" Version="0.1.0-alpha.2"/>':`<ProjectReference Include="${root}/sdk/dotnet/Truyn.Sdk.csproj"/>`;
  writeFileSync(join(dotnetDir,'Actor.csproj'),`<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup><ItemGroup>${reference}</ItemGroup></Project>`);
  build('dotnet',['build',join(dotnetDir,'Actor.csproj'),'--configuration','Release','--nologo']);
  built.set('dotnet:'+mode,{command:'dotnet',args:[join(dotnetDir,'bin/Release/net8.0/Actor.dll')]});
 }
 function executable(language,mode){
  if(language==='typescript')return{command:process.execPath,args:['--experimental-strip-types',join(here,'actor.ts'),mode]};
  if(language==='python')return{command:mode==='published'?process.env.TRUYN_LEGACY_PYTHON:process.env.TRUYN_CANDIDATE_PYTHON,args:[join(here,'actor.py')]};
  return built.get(language+':'+mode);
 }
 async function peer(language,mode,relayUrl,protocols=['TRUYN/1']){
  const trace=[];
  const proxy=http.createServer(async(req,res)=>{
   try{
    let bytes='';for await(const chunk of req){bytes+=chunk;if(bytes.length>262144)throw Error('fixture_body_bound');}
    const auth=req.headers.authorization,headers={'content-type':'application/json',...(auth?{authorization:auth}:{})};
    const response=await fetch(relayUrl+req.url,{method:req.method,headers,...(bytes?{body:bytes}:{}),signal:AbortSignal.timeout(6000)});
    const body=await response.text();trace.push({path:req.url,method:req.method,headers,bytes,status:response.status,reply:JSON.parse(body)});
    res.writeHead(response.status,{'content-type':'application/json'}).end(body);
   }catch{res.writeHead(500,{'content-type':'application/json'}).end('{"error":"fixture_proxy_failure"}');}
  });
  await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${proxy.address().port}`,spec=executable(language,mode);
  const child=spawn(spec.command,spec.args,{cwd:root,env:process.env,stdio:['pipe','pipe','pipe']});
  let pending=null,stderr='';child.stderr.on('data',b=>{stderr=(stderr+b).slice(-5000);});
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{if(!pending)return;const active=pending;pending=null;clearTimeout(active.timer);try{active.resolve(JSON.parse(line));}catch{active.reject(Error('invalid_actor_json:'+language));}});
  child.on('error',e=>{if(pending){clearTimeout(pending.timer);pending.reject(e);pending=null;}});
  child.on('exit',()=>{if(pending){clearTimeout(pending.timer);pending.reject(Error('actor_exit:'+language+':'+stderr));pending=null;}});
  const call=arg=>new Promise((resolve,reject)=>{
   if(pending)return reject(Error('fixture_concurrent_actor_call'));
   const timer=setTimeout(()=>{pending=null;child.kill('SIGKILL');reject(Error('actor_timeout:'+language));},12000);
   pending={resolve,reject,timer};child.stdin.write(JSON.stringify(arg)+'\n');
  });
  const close=async()=>{if(child.exitCode===null){try{await call({op:'close'});}catch{}child.kill();}lines.close();proxy.closeAllConnections();await new Promise(r=>proxy.close(r));};
  const initial=await call({op:'init',url,protocols});
  return{call,close,trace,initial,language,mode};
 }
 const okay=async(p,op,args={})=>{const r=await p.call({op,...args});assert.equal(r.ok,true,`${p.language}/${p.mode}:${op}:${r.message}`);return r.value;};
 const deny=async(p,op,args,status)=>{const before=p.trace.length,r=await p.call({op,...args});assert.equal(r.ok,false,'denial must reach SDK caller');assert.ok(p.trace.length>before,'denial must be an actual relay response');assert.equal(p.trace.at(-1).status,status);return r;};
 const last=(p,path)=>{const r=p.trace.findLast(x=>x.path===path);assert.ok(r,'captured native signed request '+path);return r;};
 async function replay(relayUrl,request,transform=null){const bytes=transform?JSON.stringify(transform(JSON.parse(request.bytes))):request.bytes;const r=await fetch(relayUrl+request.path,{method:request.method,headers:request.headers,body:bytes});return{status:r.status,body:await r.json()};}
 async function drain(relayUrl,p){const reg=last(p,'/v1/register').reply;const r=await fetch(relayUrl+'/v1/events?nodeId='+encodeURIComponent(p.initial.value.nodeId),{headers:{authorization:'Bearer '+reg.sessionToken}});assert.equal(r.status,200);return(await r.json()).events;}
 async function runCase(language,pMode,rMode){
  const relay=createRelay({localDevelopmentMode:true,maxQueuedEventsPerNode:8}),url=await relay.listen({port:0});
  const actors=[];let current='setup';
  const record=(scenario,status='PASS',extra={})=>rows.push({language,provider:pMode,requester:rMode,scenario,status,...extra});
  try{
   const p=await peer(language,pMode,url);actors.push(p);const r=await peer(language,rMode,url);actors.push(r);
   assert.equal(p.initial.ok,true);assert.equal(r.initial.ok,true);
   for(const a of [p,r])surfaces.push({language,mode:a.mode,...a.initial.value,nodeId:undefined});
   const cap='fixture.lifecycle.'+language+'.'+pMode+'.'+rMode;
   const off=await okay(p,'offer',{capability:cap}),offered=last(p,'/v1/offers');
   current='offer-signature';assert.equal(verifyEnvelope(JSON.parse(offered.bytes).envelope).ok,true);
   const bad=await replay(url,offered,x=>{x.envelope.payload.capability.name+='tampered';return x;});assert.ok(bad.status>=400&&bad.status<500);assert.equal(relay.state.offers.size,1);record(current);
   current='offer-owner';await deny(r,'withdraw',{id:off.offerId},403);assert.equal(relay.state.offers.get(off.offerId).revoked,false);record(current);
   const n=await okay(r,'need',{capability:cap}),submitted=last(r,'/v1/needs');
   const work=await okay(p,'next');assert.equal(work.needId,n.needId);assert.equal(work.verified,true);
   current='need-replay';assert.equal((await replay(url,submitted)).status,409);assert.equal((await drain(url,p)).length,0);record(current);
   current='cross-transport-replay';
   // Separate adversarial identity, never a replacement signer for a tested SDK.
   const evil=new TruynNode({relayUrl:url});await evil.register();const payload={capability:{name:cap},input:{fixture:true},policy:{}};
   const cross=await fetch(url+'/v1/fast/needs?waitMs=0',{method:'POST',headers:{'content-type':'application/json',...evil.authHeaders()},body:JSON.stringify({frame:evil.compactFrame('NEED',payload,{id:n.needId}),payload})});assert.equal(cross.status,409);assert.equal((await drain(url,p)).length,0);record(current);
   current='cancel-owner';await deny(p,'cancel',{id:n.needId},403);assert.equal(relay.state.requests.get(n.needId).status,'matched');record(current);
   current='result-owner';await deny(r,'result',{id:n.needId},403);assert.equal(relay.state.requests.get(n.needId).status,'matched');record(current);
   current='withdrawal-preserves-work';await okay(p,'withdraw',{id:off.offerId});assert.equal(relay.state.offers.get(off.offerId).revoked,true);assert.equal(relay.state.requests.get(n.needId).status,'matched');record(current);
   current='result-delivery';await okay(p,'result',{id:n.needId});const received=await okay(r,'wait',{id:n.needId});assert.equal(received.needId,n.needId);assert.equal(received.verified,true);record(current);
   const count=relay.state.stats.get(p.initial.value.nodeId).successfulTasks;
   current='duplicate-terminal';await deny(p,'result',{id:n.needId},409);assert.equal((await drain(url,r)).length,0);assert.equal(relay.state.stats.get(p.initial.value.nodeId).successfulTasks,count);record(current);
   current='cancel-after-result';await deny(r,'cancel',{id:n.needId},409);assert.equal(relay.state.requests.get(n.needId).status,'completed');record(current);
   await okay(p,'offer',{capability:cap});const c=await okay(r,'need',{capability:cap}),cancelledNeed=last(r,'/v1/needs');await okay(p,'next');
   current='cancel-idempotent';await okay(r,'cancel',{id:c.needId});const cancellation=last(r,'/v1/revoke');assert.equal((await replay(url,cancellation)).status,200);const controls=await drain(url,p);assert.equal(controls.filter(e=>e.kind==='REVOKE').length,2);for(const e of controls)assert.equal(verifyEnvelope(e.envelope).ok,true);assert.equal(relay.state.requests.get(c.needId).status,'cancelled');record(current);
   current='late-result-after-cancel';await deny(p,'result',{id:c.needId},409);assert.equal((await drain(url,r)).filter(e=>e.kind==='RESULT').length,0);record(current);
   current='replay-after-cancel';assert.equal((await replay(url,cancelledNeed)).status,409);assert.equal((await drain(url,p)).length,0);record(current);
   const q=await okay(r,'need',{capability:cap});await okay(p,'next');
   current='terminal-race';
   const pStart=p.trace.length,rStart=r.trace.length;
   const race=await Promise.all([p.call({op:'result',id:q.needId}),r.call({op:'cancel',id:q.needId})]);
   const raceEvidence=verifyTerminalRace({needId:q.needId,provider:p.initial.value.nodeId,requester:r.initial.value.nodeId,
    terminalState:relay.state.requests.get(q.needId).status,rpc:race,providerTrace:p.trace.slice(pStart),requesterTrace:r.trace.slice(rStart)});
   record(current,'PASS',{relayRace:raceEvidence});
   current='version-mismatch';const before=relay.state.nodes.size,v=await peer(language,rMode,url,['TRUYN/99999']);actors.push(v);assert.equal(v.initial.ok,false);assert.equal(v.trace.at(-1).status,409);assert.equal(relay.state.nodes.size,before);record(current);
  }catch(e){record(current,'FAIL',{reason:String(e.message).slice(0,1000)});throw e;}
  finally{for(const a of actors)await a.close();await relay.close();}
 }
 async function streamCase(language,pMode,rMode){
  const relay=createRelay({localDevelopmentMode:true,maxQueuedEventsPerNode:1}),url=await relay.listen({port:0});const actors=[];let current='compact-setup';
  const record=scenario=>rows.push({language,provider:pMode,requester:rMode,scenario,status:'PASS',surface:'public-bundled-runtime'});
  try{
   const p=await peer(language,pMode,url);actors.push(p);const r=await peer(language,rMode,url);actors.push(r);
   assert.equal(p.initial.value.compactApi,true);assert.equal(r.initial.value.compactApi,true);
   const cap='fixture.compact';await okay(p,'offer',{capability:cap});let n=await okay(r,'compactNeed',{capability:cap});await okay(p,'compactPoll');
   current='sequence-gap';assert.equal((await okay(p,'partial',{id:n.needId,sequence:1,delta:'gap'})).status,409);assert.equal(relay.state.requests.get(n.needId).nextPartialSequence,0);record(current);
   current='foreign-partial';assert.equal((await okay(r,'partial',{id:n.needId,sequence:0,delta:'foreign'})).status,403);record(current);
   current='first-partial';assert.equal((await okay(p,'partial',{id:n.needId,sequence:0,delta:'first'})).status,200);record(current);
   current='identical-retry';assert.equal((await okay(p,'partial',{id:n.needId,sequence:0,delta:'first'})).status,200);record(current);
   current='conflicting-retry';assert.equal((await okay(p,'partial',{id:n.needId,sequence:0,delta:'changed'})).status,409);record(current);
   current='backpressure';assert.equal((await okay(p,'partial',{id:n.needId,sequence:1,delta:'second'})).status,429);assert.equal(relay.state.requests.get(n.needId).nextPartialSequence,1);record(current);
   current='drain-ordered';const first=await okay(r,'compactPoll');assert.equal(first.events.length,1);assert.equal(first.events[0].payload.sequence,0);assert.equal(first.events[0].verification.ok,true);record(current);
   current='retry-after-backpressure';assert.equal((await okay(p,'partial',{id:n.needId,sequence:1,delta:'second'})).status,200);const second=await okay(r,'compactPoll');assert.equal(second.events[0].payload.sequence,1);assert.equal(second.events[0].verification.ok,true);record(current);
   current='terminal-after-stream';await okay(p,'compactResult',{id:n.needId});const result=await okay(r,'compactPoll');assert.equal(result.events.length,1);assert.equal(result.events[0].kind,'RESULT');assert.equal(result.events[0].verification.ok,true);record(current);
   current='late-partial';assert.equal((await okay(p,'partial',{id:n.needId,sequence:2,delta:'late'})).status,409);record(current);
   current='duplicate-stream-result';await deny(p,'compactResult',{id:n.needId},409);assert.equal((await okay(r,'compactPoll')).events.length,0);record(current);
   current='cancel-late-partial';n=await okay(r,'compactNeed',{capability:cap});await okay(p,'compactPoll');await okay(r,'cancel',{id:n.needId});assert.equal((await okay(p,'partial',{id:n.needId,sequence:0,delta:'cancelled'})).status,409);record(current);
  }catch(e){rows.push({language,provider:pMode,requester:rMode,scenario:current,status:'FAIL',reason:String(e.message).slice(0,1000)});throw e;}
  finally{for(const a of actors)await a.close();await relay.close();}
 }
 for(const language of languages)for(const pMode of modes)for(const rMode of modes){
  await runCase(language,pMode,rMode);
  const providerSurface=surfaces.find(s=>s.language===language&&s.mode===pMode);
  const requesterSurface=surfaces.find(s=>s.language===language&&s.mode===rMode);
  assert.ok(providerSurface&&requesterSurface,'native lifecycle surface discovery required');
  if(language==='typescript'&&providerSurface.compactApi===true&&requesterSurface.compactApi===true)await streamCase(language,pMode,rMode);
  else for(const scenario of streaming)rows.push({language,provider:pMode,requester:rMode,scenario,status:'UNSUPPORTED',reason:'This published/source mixed-version harness does not execute compact lifecycle for the selected pair; not PASS. The native successor source/package harness is qualified separately.'});
 }
 const unique=new Set(rows.map(r=>[r.language,r.provider,r.requester,r.scenario].join(':')));
 assert.equal(unique.size,rows.length);assert.equal(rows.length,languages.length*modes.length*modes.length*(ordinary.length+streaming.length));
 for(const row of rows)assert.ok(['PASS','UNSUPPORTED'].includes(row.status));
 for(const language of languages)for(const mode of modes){const found=surfaces.filter(s=>s.language===language&&s.mode===mode);assert.ok(found.length);assert.ok(found.every(s=>typeof s.compactApi==='boolean'),'every SDK mode must explicitly declare compact API support');}
 const unsupported=rows.filter(r=>r.status==='UNSUPPORTED');
 const report={schema:'truyn.five-sdk-lifecycle/v1',sourceSha:source,treeSha:tree,runId:process.env.GITHUB_RUN_ID||null,runAttempt:process.env.GITHUB_RUN_ATTEMPT||null,
  priorPackageProofSha256:sha256(priorBytes),frozenSdkSourceSha:'57971b134a41c3e3ea4b42f68e86a7d117036006',
  scope:'real verified published/source SDK lifecycle; explicit native compact API gaps',ordinaryCaseCount:ordinary.length*20,
  partialPassed:rows.filter(r=>streaming.includes(r.scenario)&&r.status==='PASS').length,passed:rows.filter(r=>r.status==='PASS').length,unsupported:unsupported.length,
  lifecycleCoverageStatus:unsupported.length?'BLOCKED_UNSUPPORTED_SDK_API':'PASS',stableProtocolDeclared:false,productionCutoverAuthorized:false,
  remainingP14Prerequisites:['Native compact/PARTIAL coverage for every required published SDK version','Independent P1-P13 exact-release reconciliation including required durable/restart qualification','Same-revision CI, hosted security, package provenance and post-merge acceptance'],
  surfaces:[...new Map(surfaces.map(s=>[s.language+':'+s.mode,s])).values()],outcomes:rows};
 writeFileSync(join(evidence,'lifecycle-report.json'),JSON.stringify(report,null,2)+'\n');
 const admission=evaluateLifecycle(report,{sourceSha:source,treeSha:tree,runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,priorPackageProofSha256:sha256(priorBytes)});
 writeFileSync(join(evidence,'p14-lifecycle-coverage.json'),JSON.stringify(admission,null,2)+'\n');
 if(process.env.GITHUB_STEP_SUMMARY)writeFileSync(process.env.GITHUB_STEP_SUMMARY,`## Lifecycle coverage: ${admission.status}\n\n${admission.passed}/${admission.expectedCases} native/SDK-primitive scenarios PASS. ${admission.blockers.length} missing or unsupported scenarios. Stable TRUYN/1 is NOT declared.\n`,{flag:'a'});
 console.log(`SDK lifecycle: ${report.passed} PASS, ${report.unsupported} UNSUPPORTED; ${report.lifecycleCoverageStatus}.`);
} catch(e){
 writeFileSync(join(evidence,'lifecycle-failure.json'),JSON.stringify({schema:'truyn.five-sdk-lifecycle-failure/v1',sourceSha:source,treeSha:tree,status:'FAIL',reason:String(e.message),outcomes:rows},null,2)+'\n');throw e;
} finally{rmSync(temp,{recursive:true,force:true});}
