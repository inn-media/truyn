import assert from 'node:assert/strict';
import test from 'node:test';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

test('G5 async OFFER restore reserves registration replay identity BEFORE awaiting storage', {timeout:10000}, async t => {
  let release, entered, enteredTwice, calls=0;
  const blocked=new Promise(resolve=>{release=resolve;});
  const firstEntered=new Promise(resolve=>{entered=resolve;});
  const secondEntered=new Promise(resolve=>{enteredTwice=resolve;});
  const ledger={kind:'cosmos-multi-host-v1',
    async restoreOffers(){ calls++; if(calls===1)entered();else enteredTwice(); await blocked; return []; },
    async compactNeed(){throw Error('not called');},async compactOffer(){throw Error('not called');}
  };
  const relay=createRelay({localDevelopmentMode:true,lifecycleMaintenance:true,lifecycleLedger:ledger});
  t.after(()=>relay.close());
  const url=await relay.listen({port:0});
  const node=new TruynNode({relayUrl:url});
  const envelope=node.envelope('IDENTITY',{nodeId:node.identity.nodeId,algorithm:node.identity.algorithm,protocols:['TRUYN/1']});
  const send=async()=>{
    const response=await fetch(url+'/v1/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({envelope})});
    return {status:response.status,body:await response.json()};
  };
  const first=send(); await firstEntered;
  const second=send();
  try { await Promise.race([second,secondEntered]); } finally { release(); }
  const replies=await Promise.all([first,second]);
  assert.deepEqual(replies.map(x=>x.status).sort(),[200,409]);
  assert.equal(replies.find(x=>x.status===409).body.error,'registration_replay');
  assert.equal(calls,1,'duplicate registration must not perform another directory query');
});
