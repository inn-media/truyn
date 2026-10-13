import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
const [mode, relayUrl] = process.argv.slice(2);
if (!['legacy','candidate'].includes(mode) || !relayUrl) throw Error('invalid_role_config');
const module = mode === 'legacy'
  ? await import(resolve(process.env.TRUYN_LEGACY_NPM_ROOT!, 'node_modules/@truyn/sdk/dist/index.js'))
  : process.env.TRUYN_CANDIDATE_NPM_ROOT
    ? await import(resolve(process.env.TRUYN_CANDIDATE_NPM_ROOT, 'node_modules/@truyn/sdk/dist/index.js'))
    : await import('../../typescript/src/local-node.ts');
const peers = new Map<string, any>();
for await (const line of createInterface({ input:process.stdin, crlfDelay:Infinity })) {
  let message:any;
  try {
    message=JSON.parse(line); const a=message.args || {}; let p=peers.get(a.actor); let value:any;
    switch(message.action){
      case 'connect': {
        p=await module.TruynLocalNodeClient.connect({relayUrl, name:a.actor, protocols:a.protocols||['TRUYN/1']}); peers.set(a.actor,p);
        value={nodeId:p.nodeId,cancel:typeof p.runtime.revoke==='function',withdraw:typeof p.runtime.revoke==='function',partial:typeof p.runtime.compactFrame==='function'&&typeof p.runtime.pollCompact==='function',surface:'exported-runtime'}; break;
      }
      case 'offer': value=await p.offer(a.capability,a.metadata||{}); break;
      case 'need': value=await p.need(a.capability,{probe:true}); break;
      case 'result': value=await p.result(a.needId,a.output??{answer:42});break;
      case 'waitResult': { const result=await p.runtime.poll({waitMs:0}); const r=result.events.find((x:any)=>x.kind==='RESULT'&&x.envelope?.payload?.requestId===a.needId); if(!r)throw Error('missing_result');value={needId:a.needId,verified:r.verification?.ok===true,...(a.includeOutput?{output:r.envelope.payload.output}:{})};break; }
      case 'nextNeed': { const result=await p.runtime.poll({waitMs:0});const r=result.events.find((x:any)=>x.kind==='NEED');if(!r)throw Error('missing_need');value={needId:r.envelope.id,verified:r.verification?.ok===true};break; }
      case 'cancel': value=await p.runtime.revoke(a.needId,'test_cancel',{targetKind:'need'});break;
      case 'withdraw': value=await p.runtime.revoke(a.offerId,'test_withdraw',{targetKind:'offer'});break;
      case 'poll': { const r=await p.runtime.poll({waitMs:0});value=r.events.map((x:any)=>({kind:x.kind,verified:x.verification?.ok===true}));break; }
      case 'compactNeed': value=await p.runtime.compactNeed(a.capability,{probe:true},{},{waitMs:0});break;
      case 'compactResult': value=await p.runtime.compactResult(a.needId,{answer:42});break;
      case 'partial': {
        const payload={sequence:a.sequence,delta:a.delta,metadata:{}};
        const frame=p.runtime.compactFrame('PARTIAL',payload,{id:a.needId});
        const r=await fetch(relayUrl+'/v1/fast/partials',{method:'POST',headers:{'content-type':'application/json',...p.runtime.authHeaders()},body:JSON.stringify({frame,payload})});
        value=await r.json();if(!r.ok)throw Error('HTTP_'+r.status);break;
      }
      case 'pollCompact': {const r=await p.runtime.pollCompact({waitMs:0});value=r.events.map((x:any)=>({kind:x.kind,sequence:x.payload?.sequence,verified:x.verification?.ok===true}));break;}
      default: throw Error('unsupported_action');
    }
    console.log(JSON.stringify({id:message.id,ok:true,value:value??null}));
  } catch(error:any) {console.log(JSON.stringify({id:message?.id,ok:false,code:error?.code??null,error:String(error?.body?.error||error?.message||error).slice(0,150)}));}
}
for(const p of peers.values())p.close();
