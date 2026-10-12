import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { canonicalize, verifyEnvelope } from '../core/protocol/index.js';
import { createDurableOfferDirectory } from '../network/relay/g5-offer-directory.js';
import { createRuntimeG5RelayLifecycleLedger } from '../runtime/g5-relay-lifecycle-ledger.js';

// Real relay HTTP, node signing and canonical verifier. Shared persistence is
// an explicit CAS model, not a live Azure account or paid provider.
function shared() {
 let directory=null,etag=0;const needs=new Map();
 const storage={async read(){return directory?{document:structuredClone(directory),etag:String(etag)}:null;},
  async cas(_id,expected,next){if((directory?String(etag):null)!==expected)return false;directory=structuredClone(next);etag++;return true;}};
 const make=()=>createDurableOfferDirectory({storage,canonicalize,verifyEnvelope,authorityId:'relay-tests'});
 return {make,ledger(offerDirectory){return {kind:'cosmos-multi-host-v1',offerDirectory,
  getOffer:async()=>null,getNeed:async id=>needs.get(id)||null,
  async reserveNeed(row){if(needs.has(row.id))throw Object.assign(Error('duplicate_request'),{httpStatus:409,publicCode:'duplicate_request'});needs.set(row.id,{...row,status:'matched'});},
  async transitionNeed({id,to}){const row=needs.get(id);assert.equal(row.status,'matched');row.status=to;return {changed:true};}
 };}};
}
async function fixture(t, publicMode=false) {
 const store=shared(),dirs=[store.make(),store.make()];await dirs[0].initialize();
 const relays=dirs.map(d=>createRelay({lifecycleLedger:store.ledger(d),
  ...(publicMode?{allowPublicRegistration:true,allowPublicDispatch:true}:{localDevelopmentMode:true})}));
 for(const r of relays)t.after(()=>r.close());
 const urls=await Promise.all(relays.map(r=>r.listen({port:0})));
 const a=new TruynNode({relayUrl:urls[0]}),b=new TruynNode({relayUrl:urls[1],identity:a.identity}),requester=new TruynNode({relayUrl:urls[1]});
 await a.register();await requester.register();return {a,b,requester,dirs,relays};
}
test('G5 OFFER: peer relay rediscovers signed offer after provider registration without re-announcement',async t=>{
 const {a,b,requester,dirs}=await fixture(t);
 const offered=await a.offer('directory.work');
 assert.equal((await requester.find('directory.work')).offers.length,0,'unregistered peer provider must not be routable');
 await b.register();
 const found=await requester.find('directory.work');assert.equal(found.offers.length,1);assert.equal(found.offers[0].id,offered.offerId);
 const accepted=await requester.need('directory.work',{example:1});
 assert.equal((await b.poll()).events.length,1);await b.result(accepted.needId,'ok');
 await b.revoke(offered.offerId,'withdraw after migration',{targetKind:'offer'});
 assert.equal((await requester.find('directory.work')).offers.length,0);
 assert.equal((await dirs[1].compactWithdrawn()).compacted,1);
 assert.equal((await requester.find('directory.work')).offers.length,0);
 await assert.rejects(()=>requester.need('directory.work',{}));
});
test('G5 OFFER: peer discovery preserves provider ownership policy, not just stored visibility',async t=>{
 const {a,b,requester}=await fixture(t,true);await a.offer('private.directory');await b.register();
 assert.equal((await requester.find('private.directory')).offers.length,0);
 await assert.rejects(()=>requester.need('private.directory',{}));assert.equal((await b.poll()).events.length,0);
 const allowed=await a.offer('shared.directory',{allowedRequesterIds:[requester.identity.nodeId]});
 assert.equal((await requester.find('shared.directory')).offers[0].id,allowed.offerId);
});
test('G5 OFFER: real canonical signature corruption and wrong revoker do not alter directory',async t=>{
 const {a,b,requester,dirs}=await fixture(t);await b.register();const offered=await a.offer('directory.integrity');
 const row=await dirs[0].lookup(offered.offerId);assert.deepEqual(verifyEnvelope(row.envelope,{allowedTypes:['OFFER']}),{ok:true});
 await assert.rejects(()=>dirs[1].publish({authenticatedOwner:a.identity.nodeId,envelope:{...row.envelope,payload:{capability:'forged'}}}),e=>e.publicCode==='offer_directory_signature_invalid');
 await assert.rejects(()=>requester.revoke(offered.offerId,'foreign',{targetKind:'offer'}));
 assert.equal((await requester.find('directory.integrity')).offers.length,1);
});
test('G5 OFFER runtime remains default-off and never silently shares lifecycle container',()=>{
 assert.equal(createRuntimeG5RelayLifecycleLedger({env:{}}),null);
 assert.throws(()=>createRuntimeG5RelayLifecycleLedger({env:{TRUYN_G5_OFFER_DIRECTORY:'cosmos-strong-v1'}}),/explicit Cosmos/);
 const env={TRUYN_G5_RELAY_LIFECYCLE_LEDGER:'cosmos',TRUYN_G5_OFFER_DIRECTORY:'cosmos-strong-v1',
  TRUYN_G5_COSMOS_ENDPOINT:'https://test.documents.azure.com',TRUYN_G5_COSMOS_DATABASE:'g5',TRUYN_G5_COSMOS_CONTAINER:'ledger'};
 assert.throws(()=>createRuntimeG5RelayLifecycleLedger({env,tokenProvider:async()=> 'fixture'}),/dedicated container/);
 assert.throws(()=>createRuntimeG5RelayLifecycleLedger({env:{...env,TRUYN_G5_OFFER_DIRECTORY_CONTAINER:'ledger',TRUYN_G5_OFFER_DIRECTORY_AUTHORITY:'test'},tokenProvider:async()=> 'fixture'}),/dedicated container/);
});
