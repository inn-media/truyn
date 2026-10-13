import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
const mod=process.argv[2]==='published'
 ? await import(resolve(process.env.TRUYN_LEGACY_NPM_ROOT!, 'node_modules/@truyn/sdk/dist/index.js'))
 : await import('../../typescript/src/local-node.ts');
let peer:any;
for await (const line of createInterface({input:process.stdin,crlfDelay:Infinity})) {
 const a=JSON.parse(line); let value:any=null;
 try {
  switch(a.op){
   case 'init': peer=await mod.TruynLocalNodeClient.connect({relayUrl:a.url,protocols:a.protocols||['TRUYN/1']});
    value={nodeId:peer.nodeId,cancelSurface:'public-bundled-runtime',compactApi:['compactNeed','compactFrame','pollCompact'].every(k=>typeof peer.runtime[k]==='function')};break;
   case 'offer':value=await peer.offer(a.capability);break;
   case 'need':value=await peer.need(a.capability,{fixture:true});break;
   case 'result':value=await peer.result(a.id,{answer:42});break;
   case 'next': {const e=(await peer.runtime.poll()).events.find((e:any)=>e.kind==='NEED');if(!e)throw Error('missing_need');value={needId:e.envelope.id,verified:e.verification.ok};break;}
   case 'wait': {const e=(await peer.runtime.poll()).events.find((e:any)=>e.kind==='RESULT'&&e.envelope.payload.requestId===a.id);if(!e)throw Error('missing_result');value={needId:e.envelope.payload.requestId,verified:e.verification.ok};break;}
   case 'cancel':value=await peer.runtime.revoke(a.id,'fixture',{targetKind:'need'});break;
   case 'withdraw':value=await peer.runtime.revoke(a.id,'fixture',{targetKind:'offer'});break;
   case 'compactNeed':value=await peer.runtime.compactNeed(a.capability,{fixture:true},{},{waitMs:0});break;
   case 'compactResult':value=await peer.runtime.compactResult(a.id,{answer:42});break;
   case 'compactPoll':value=await peer.runtime.pollCompact({waitMs:0});break;
   case 'partial':{const payload={sequence:a.sequence,delta:a.delta,metadata:{}};
    const response=await fetch(peer.runtime.relayUrl+'/v1/fast/partials',{method:'POST',headers:{'content-type':'application/json',...peer.runtime.authHeaders()},body:JSON.stringify({frame:peer.runtime.compactFrame('PARTIAL',payload,{id:a.id}),payload})});
    value={status:response.status,body:await response.json()};break;}
   case 'close':peer?.close();console.log(JSON.stringify({ok:true,value:null}));process.exit(0);
   default:throw Error('unsupported_fixture_operation');
  }
  console.log(JSON.stringify({ok:true,value}));
 } catch(e:any){console.log(JSON.stringify({ok:false,error:e.code||e.status||e.name,message:e.body?.error||e.message}));}
}
