import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { delimiter } from 'node:path';
export function launchNativePeer(language,mode,url) {
  const root='sdk/conformance/lifecycle-peer/'; let command,args;
  if(language==='typescript'){command=process.execPath;args=['--experimental-strip-types',root+'peer.ts',mode,url];}
  if(language==='python'){command=process.env[mode==='legacy'?'TRUYN_LEGACY_PYTHON':'TRUYN_CANDIDATE_PYTHON'];args=[root+'peer.py',mode,url];}
  if(language==='go'){command='/tmp/truyn-lifecycle-'+mode+'-go';args=[mode,url];}
  if(language==='java'){command='java';args=['-cp',(mode==='legacy'?process.env.TRUYN_LEGACY_JAVA_CP:process.env.TRUYN_CANDIDATE_JAVA_CP)+delimiter+'/tmp/truyn-lifecycle-'+mode+'-java','org.truyn.sdk.LifecyclePeer',mode,url];}
  if(language==='dotnet'){command='dotnet';args=[root+'dotnet/'+mode+'/bin/Release/net8.0/'+(mode==='legacy'?'LegacyLifecycle':'CandidateLifecycle')+'.dll',mode,url];}
  assert.ok(command); const child=spawn(command,args,{stdio:['pipe','pipe','pipe'],env:process.env});
  let pending,sequence=0,stderr='';
  child.stderr.on('data',d=>{stderr=(stderr+d).slice(-2000);});
  const reject = error => { if(pending){clearTimeout(pending.timer);pending.reject(error);pending=null;} };
  child.on('error',reject); child.on('exit',()=>reject(Error('native peer exited: '+stderr)));
  createInterface({input:child.stdout}).on('line',line=>{
    let result; try{result=JSON.parse(line);}catch{return;}
    if(pending&&result.id===pending.id){clearTimeout(pending.timer);const p=pending;pending=null;p.resolve(result);}
  });
  return { child, call(action,args) { return new Promise((resolveCall,rejectCall)=>{
    const id=++sequence; const timer=setTimeout(()=>reject(Error('native registration timeout')),10000);
    pending={id,timer,resolve:resolveCall,reject:rejectCall};
    child.stdin.write(JSON.stringify({id,action,args})+'\n');
  });}};
}
