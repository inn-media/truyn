#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { createRelay } from '../../../network/relay/server.js';

const relay = createRelay({localDevelopmentMode:true});
const relayUrl = await relay.listen({port:0});
const languages = ['typescript','python','go','java','dotnet'];
const combinations = [
  ['legacy','legacy'],['legacy','candidate'],
  ['candidate','legacy'],['candidate','candidate']
];
const outcomes=[];
function executable(lang, mode, role, capability) {
  if(lang === 'typescript') return {
    command:process.execPath,
    args:['--experimental-strip-types','sdk/conformance/legacy-peer/role.ts',mode,role,relayUrl,capability]
  };
  if(lang === 'dotnet') {
    const assembly=mode==='legacy' ? process.env.TRUYN_LEGACY_DOTNET_DLL : process.env.TRUYN_CANDIDATE_DOTNET_DLL;
    if(!assembly) throw new Error('Published and candidate NuGet assemblies required');
    return {command:'dotnet',args:[assembly,mode,role,relayUrl,capability]};
  }
  if(lang === 'java') {
    const classpath=mode==='legacy' ? process.env.TRUYN_LEGACY_JAVA_CP : process.env.TRUYN_CANDIDATE_JAVA_CP;
    if(!classpath) throw new Error('Published and candidate Java classpaths required');
    return {command:'java',args:['-cp',classpath,'LegacyPeerRole',mode,role,relayUrl,capability]};
  }
  if(lang === 'go') {
    const command=mode==='legacy' ? process.env.TRUYN_LEGACY_GO_BINARY : process.env.TRUYN_CANDIDATE_GO_BINARY;
    if(!command) throw new Error('published and candidate Go binaries are required');
    return {command,args:[mode,role,relayUrl,capability]};
  }
  const python= mode==='legacy' ? process.env.TRUYN_LEGACY_PYTHON : process.env.TRUYN_CANDIDATE_PYTHON;
  if(!python) throw new Error('Both Python interpreters must be explicitly installed from separate published/current SDK sources');
  return {
    command:python,args:['sdk/conformance/legacy-peer/role.py',mode,role,relayUrl,capability]
  };
}
function launch(lang,mode,role,capability) {
  const spec=executable(lang,mode,role,capability);
  const child=spawn(spec.command,spec.args,{cwd:process.cwd(),env:process.env,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',d=>{stdout+=d;});
  child.stderr.on('data',d=>{stderr+=d;});
  const complete=new Promise((done,reject)=>{
    child.once('error',reject);
    child.once('close',(code)=> code===0 ? done({stdout,stderr}) : reject(new Error(lang+' '+mode+' '+role+' exit '+code+'\n'+stdout+'\n'+stderr)));
  });
  return {child,complete,ready:async()=>{
    const started=Date.now();
    while(!stdout.includes('READY\n')){
      if(child.exitCode!==null) throw new Error('provider exited before READY: '+stderr);
      if(Date.now()-started>12000) throw new Error('provider READY timeout: '+stdout+stderr);
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  }};
}
try {
 for(const lang of languages) for(const [p,r] of combinations){
   const capability='truyn.legacy.compat.'+lang+'.'+p+'.'+r+'.'+Date.now();
   const provider=launch(lang,p,'provider',capability);
   try {
     await provider.ready();
     const requester=launch(lang,r,'requester',capability);
     try {
       await Promise.all([provider.complete,requester.complete]);
       outcomes.push({language:lang,provider:p,requester:r,status:'PASS'});
       process.stdout.write('PASS '+lang+' '+p+' provider -> '+r+' requester\n');
     } catch(e){requester.child.kill();throw e;}
   }catch(e){provider.child.kill();throw e;}
 }
 process.stdout.write(JSON.stringify({schema:'truyn.legacy-sdk-matrix/1',status:'PASS',outcomes},null,2)+'\n');
}finally{await relay.close();}
