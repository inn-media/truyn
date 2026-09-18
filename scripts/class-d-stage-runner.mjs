#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const RESULT_SCHEMA = 'truyn.class-d.stage-runner.result.v1';
const SUPPORTED = new Map([
  [200, { diagnosticNodes: 6, acceptanceTests: ['tests/d200-route-repair-acceptance-invariants.test.js','tests/d200-peer-propagation-readiness-barrier.test.js'] }],
  [500, { diagnosticNodes: 8, acceptanceTests: ['tests/dht-replication-keyspace.test.js','tests/peer-record-renewal-productionization.test.js','tests/class-d-terminal-verifier.test.js'] }],
  [1000, { diagnosticNodes: 10, acceptanceTests: ['tests/class-d-1000-fail-evidence.test.js','tests/class-d-1000-simultaneous-convergence.test.js','tests/class-d-terminal-verifier.test.js'] }]
]);

const now = () => new Date().toISOString();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
function clip(value, max = 12000) { const text = String(value ?? ''); return text.length <= max ? text : `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`; }
function normalize(value) { return String(value ?? '').replace(/[0-9a-f]{40,64}/gi, '<hex>').replace(/\b\d{4,}\b/g, '<n>').replace(/\/tmp\/[^\s]+/g, '<tmp>').replace(/\s+/g, ' ').trim().slice(0, 800); }
function gitHead(cwd) { const out = spawnSync('git', ['rev-parse','HEAD'], { cwd, encoding:'utf8' }); return out.status === 0 ? out.stdout.trim() : null; }
function gitChangedFiles(cwd, fromSha, toSha) { const out = spawnSync('git', ['diff','--name-only',`${fromSha}..${toSha}`], { cwd, encoding:'utf8' }); return out.status === 0 ? out.stdout.split(/\r?\n/).map((v) => v.trim()).filter(Boolean) : null; }
function inputMatches(file, input) {
  const token = String(input || '').trim(); if (!token) return false;
  if (token.endsWith('/**')) return file === token.slice(0,-3) || file.startsWith(token.slice(0,-2));
  if (token.endsWith('/')) return file.startsWith(token);
  if (token.includes('*')) { const escaped = token.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replaceAll('*','.*'); return new RegExp(`^${escaped}$`).test(file); }
  return file === token || file.startsWith(`${token}/`);
}
function descendants(plan, seeds) {
  const out = new Set(seeds); let changed = true;
  while (changed) { changed = false; for (const stage of plan.stages) if (!out.has(stage.id) && stage.dependsOn.some((dep) => out.has(dep))) { out.add(stage.id); changed = true; } }
  return out;
}
function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive:true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}
function command(argv, timeoutMs = 180000) { return { argv, timeoutMs }; }

export function planForClass(classSize) {
  const profile = SUPPORTED.get(Number(classSize));
  if (!profile) throw new Error(`unsupported class D-${classSize}; expected 200, 500, or 1000`);
  const cls = Number(classSize);
  const n = String(profile.diagnosticNodes);
  return {
    schema: 'truyn.class-d.stage-plan.v1',
    classSize: cls,
    diagnosticNodes: profile.diagnosticNodes,
    stages: [
      { id:'canonical-five-patches', dependsOn:[], inputs:['config/class-d-five-patches.json','scripts/check-class-d-five-patches.mjs','benchmarks/scale/class-d-azure-1000-campaign.sh','network/replication/dht-replication.js','network/runtime.js','scripts/class-d-stage-runner.mjs','scripts/class-d-local-multiprocess-repro.mjs','scripts/d200-local-multiprocess-repro.mjs','.github/workflows/class-d-five-patch-preflight.yml'], command:command(['node','scripts/check-class-d-five-patches.mjs'],60000) },
      { id:'campaign-syntax', dependsOn:[], inputs:['benchmarks/scale/class-d-azure-1000-campaign.sh','benchmarks/scale/class-d-azure-1000-provision.sh','scripts/class-d-1000-final-acceptance.sh'], command:command(['bash','-lc','bash -n benchmarks/scale/class-d-azure-1000-campaign.sh && bash -n benchmarks/scale/class-d-azure-1000-provision.sh && bash -n scripts/class-d-1000-final-acceptance.sh'],60000) },
      { id:'local-topology', dependsOn:['canonical-five-patches'], inputs:['network/','core/','scripts/class-d-local-multiprocess-repro.mjs','scripts/d200-local-multiprocess-repro.mjs'], command:command(['node','scripts/class-d-local-multiprocess-repro.mjs','--class',String(cls),'--scenario','topology','--nodes',n],90000) },
      { id:'local-readiness', dependsOn:['local-topology'], inputs:['network/','core/','scripts/class-d-local-multiprocess-repro.mjs','benchmarks/scale/class-d-azure-1000-campaign.sh'], command:command(['node','scripts/class-d-local-multiprocess-repro.mjs','--class',String(cls),'--scenario','readiness','--nodes',n],90000) },
      { id:'local-routing', dependsOn:['local-topology'], inputs:['network/','core/','scripts/class-d-local-multiprocess-repro.mjs'], command:command(['node','scripts/class-d-local-multiprocess-repro.mjs','--class',String(cls),'--scenario','routing','--nodes',n],90000) },
      { id:'local-durability', dependsOn:['local-topology'], inputs:['network/replication/','network/dht/','network/testnet/','scripts/class-d-local-multiprocess-repro.mjs'], command:command(['node','scripts/class-d-local-multiprocess-repro.mjs','--class',String(cls),'--scenario','durability','--nodes',n],90000) },
      { id:'local-recovery', dependsOn:['local-routing'], inputs:['network/','scripts/class-d-local-multiprocess-repro.mjs'], command:command(['node','scripts/class-d-local-multiprocess-repro.mjs','--class',String(cls),'--scenario','recovery','--nodes',n],90000) },
      { id:'local-renewal', dependsOn:['local-topology'], inputs:['network/runtime.js','network/discovery/','network/testnet/','scripts/class-d-local-multiprocess-repro.mjs'], command:command(['node','scripts/class-d-local-multiprocess-repro.mjs','--class',String(cls),'--scenario','renewal','--nodes',n],90000) },
      { id:'acceptance-invariants', dependsOn:['campaign-syntax'], inputs:['tests/','benchmarks/scale/class-d-azure-1000-campaign.sh','scripts/class-d-1000-final-acceptance.sh'], command:command(['node','--test',...profile.acceptanceTests],180000) }
    ]
  };
}

async function executeCommand(stage, { cwd, env }) {
  const startedAt = now(); const [bin, ...args] = stage.command.argv; const timeoutMs = Number(stage.command.timeoutMs || 180000);
  return await new Promise((resolve) => {
    let stdout=''; let stderr=''; let finished=false; let timedOut=false;
    const child = spawn(bin,args,{ cwd, env:{...process.env,...env}, stdio:['ignore','pipe','pipe'] });
    child.stdout?.on('data',(chunk)=>{ stdout += chunk; if (stdout.length > 50000) stdout = stdout.slice(-50000); });
    child.stderr?.on('data',(chunk)=>{ stderr += chunk; if (stderr.length > 50000) stderr = stderr.slice(-50000); });
    const timer=setTimeout(()=>{ if(finished)return; timedOut=true; child.kill('SIGTERM'); setTimeout(()=>{ if(!finished)child.kill('SIGKILL'); },1500).unref(); },timeoutMs);
    child.on('error',(error)=>{ if(finished)return; finished=true; clearTimeout(timer); const signature=normalize(error?.stack||error?.message||error); resolve({status:'INFRA',startedAt,finishedAt:now(),exitCode:null,signal:null,stdout:clip(stdout),stderr:clip(stderr),error:signature,fingerprint:sha256(`${stage.id}|INFRA|${signature}`)}); });
    child.on('close',(code,signal)=>{ if(finished)return; finished=true; clearTimeout(timer); const status=timedOut?'INFRA':(code===0?'PASS':'FAIL'); const signature=status==='PASS'?'PASS':normalize(`${stderr}\n${stdout}\nexit=${code} signal=${signal||''}`); resolve({status,startedAt,finishedAt:now(),exitCode:typeof code==='number'?code:null,signal:signal||null,stdout:clip(stdout),stderr:clip(stderr),error:timedOut?`timeout after ${timeoutMs}ms`:null,fingerprint:sha256(`${stage.id}|${status}|${signature}`)}); });
  });
}
function summarize(plan, results) { const counts={PASS:0,FAIL:0,BLOCKED:0,INFRA:0}; for(const stage of plan.stages) counts[results.get(stage.id)?.status||'INFRA'] += 1; return {counts,clean:counts.FAIL===0&&counts.BLOCKED===0&&counts.INFRA===0}; }

export async function runPlan({ classSize, checkpointPath, cwd=process.cwd(), sourceSha=process.env.TRUYN_CLASS_D_SOURCE_SHA||process.env.GITHUB_HEAD_SHA||process.env.GITHUB_SHA||gitHead(cwd)||'unknown', resume=false, resumeAcrossSha=false, from=null, concurrency=3 }) {
  const plan=planForClass(classSize);
  if(!Number.isInteger(concurrency)||concurrency<1||concurrency>32) throw new Error('concurrency must be 1..32');
  const planDigest=sha256(JSON.stringify(plan)); let previous=null;
  if((resume||from)&&fs.existsSync(checkpointPath)) previous=JSON.parse(fs.readFileSync(checkpointPath,'utf8'));
  if(from&&!previous) throw new Error('--from requires an existing checkpoint');
  if(previous&&(previous.planDigest!==planDigest||Number(previous.classSize)!==Number(classSize))) previous=null;
  let changedFiles=[]; const invalidated=new Set();
  if(from){ if(!plan.stages.some((stage)=>stage.id===from)) throw new Error(`unknown --from stage: ${from}`); for(const id of descendants(plan,new Set([from]))) invalidated.add(id); }
  if(previous&&previous.sourceSha!==sourceSha){
    if(!resumeAcrossSha) previous=null;
    else { changedFiles=gitChangedFiles(cwd,previous.sourceSha,sourceSha); if(!changedFiles) previous=null; else { const direct=new Set(); for(const stage of plan.stages) if(stage.inputs.length===0||changedFiles.some((file)=>stage.inputs.some((input)=>inputMatches(file,input)))) direct.add(stage.id); for(const id of descendants(plan,direct)) invalidated.add(id); } }
  }
  const results=new Map(); const previousById=new Map((previous?.results||[]).map((result)=>[result.id,result]));
  if(previous) for(const stage of plan.stages){ const old=previousById.get(stage.id); if(old?.status==='PASS'&&!invalidated.has(stage.id)) results.set(stage.id,{...old,reused:true,reusedFromSha:previous.sourceSha}); }
  const startedAt=now();
  const checkpoint=()=>{ const summary=summarize(plan,results); atomicWriteJson(checkpointPath,{schema:RESULT_SCHEMA,classSize:Number(classSize),sourceSha,previousSourceSha:previous?.sourceSha||null,planDigest,startedAt,updatedAt:now(),changedFiles,invalidatedStages:[...invalidated],results:plan.stages.filter((stage)=>results.has(stage.id)).map((stage)=>results.get(stage.id)),summary}); return summary; };
  checkpoint();
  const pending=new Set(plan.stages.filter((stage)=>!results.has(stage.id)).map((stage)=>stage.id)); const byId=new Map(plan.stages.map((stage)=>[stage.id,stage]));
  while(pending.size){
    const ready=[...pending].map((id)=>byId.get(id)).filter((stage)=>stage.dependsOn.every((dep)=>results.has(dep)));
    if(!ready.length) throw new Error(`stage scheduler deadlock: ${[...pending].join(',')}`);
    const runnable=[];
    for(const stage of ready){ const failedDeps=stage.dependsOn.filter((dep)=>results.get(dep)?.status!=='PASS'); if(failedDeps.length){ results.set(stage.id,{id:stage.id,status:'BLOCKED',reused:false,startedAt:now(),finishedAt:now(),blockedBy:failedDeps,fingerprint:sha256(`${stage.id}|BLOCKED|${failedDeps.join(',')}`),command:stage.command.argv}); pending.delete(stage.id); checkpoint(); } else runnable.push(stage); }
    for(let offset=0;offset<runnable.length;offset+=concurrency){ const batch=runnable.slice(offset,offset+concurrency); const executed=await Promise.all(batch.map(async(stage)=>[stage,await executeCommand(stage,{cwd,env:{TRUYN_CLASS_D_STAGE_ID:stage.id,TRUYN_CLASS_D_SIZE:String(classSize),TRUYN_CLASS_D_SOURCE_SHA:sourceSha}})])); for(const [stage,outcome] of executed){ results.set(stage.id,{id:stage.id,reused:false,command:stage.command.argv,...outcome}); pending.delete(stage.id); checkpoint(); console.log(`TRUYN_CLASS_D_STAGE class=D-${classSize} stage=${stage.id} status=${outcome.status} fingerprint=${outcome.fingerprint}`); } }
  }
  const summary=checkpoint(); console.log(`TRUYN_CLASS_D_STAGE_RUNNER class=D-${classSize} pass=${summary.counts.PASS} fail=${summary.counts.FAIL} blocked=${summary.counts.BLOCKED} infra=${summary.counts.INFRA} clean=${summary.clean} checkpoint=${checkpointPath}`); return {classSize:Number(classSize),sourceSha,planDigest,results,summary};
}

function parseArgs(argv){ const out={classSize:200,checkpointPath:null,resume:false,resumeAcrossSha:false,from:null,concurrency:3}; for(let i=0;i<argv.length;i+=1){ const arg=argv[i]; if(arg==='--class')out.classSize=Number(argv[++i]); else if(arg==='--checkpoint')out.checkpointPath=argv[++i]; else if(arg==='--resume')out.resume=true; else if(arg==='--resume-across-sha'){out.resume=true;out.resumeAcrossSha=true;} else if(arg==='--from'){out.resume=true;out.from=argv[++i];} else if(arg==='--concurrency')out.concurrency=Number(argv[++i]); else throw new Error(`unknown argument: ${arg}`); } if(!SUPPORTED.has(out.classSize))throw new Error('--class must be 200, 500, or 1000'); if(!out.checkpointPath)out.checkpointPath=`class-d-${out.classSize}-stage-checkpoint.json`; return out; }

const args=parseArgs(process.argv.slice(2));
runPlan(args).then((result)=>{ if(!result.summary.clean)process.exitCode=1; }).catch((error)=>{ console.error(error?.stack||error); process.exitCode=2; });
