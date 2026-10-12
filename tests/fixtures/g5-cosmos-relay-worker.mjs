import { createRelay } from '../../network/relay/server.js';
import { createCosmosLifecycleLedger } from '../../network/relay/cosmos-lifecycle-ledger.js';

// Test-only: each relay is an independent OS process with its own memory,
// sharing only the parent's mock Cosmos data-plane HTTP service.
const fixture=JSON.parse(process.env.TRUYN_G5_TEST_WORKER || 'null');
if(!fixture || !fixture.mockUrl || !fixture.id) throw Error('isolated G5 test worker configuration required');
const transport=async(uri,options)=>{
  const real=new URL(uri);
  const destination=fixture.mockUrl+real.pathname+real.search;
  const headers={...options.headers,'x-g5-test-worker':fixture.id};
  return fetch(destination,{...options,headers});
};
const ledger=createCosmosLifecycleLedger({
  endpoint:'https://g5-fixture.documents.azure.com',
  database:'g5',
  container:'ledger',
  getAccessToken:async()=> 'fixture-only-entra-token',
  fetchImpl:transport
});
const relay=createRelay({localDevelopmentMode:true,lifecycleLedger:ledger});
try {
  const relayUrl=await relay.listen({port:0});
  process.send?.({ready:true,relayUrl,worker:fixture.id});
} catch(error) {
  process.send?.({ready:false,error:error.message});
  process.exitCode=1;
}
process.on('message',async(message)=>{
  if(message?.type!=='shutdown')return;
  try { await relay.close();process.disconnect?.(); }
  finally { process.exit(0); }
});
