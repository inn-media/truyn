import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSqliteLifecycleLedger } from '../network/relay/durable-lifecycle-ledger.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

function fixture(t, maxRecords = 32) {
  const dir = mkdtempSync(path.join(tmpdir(), 'truyn-g5-outbox-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, 'lifecycle.db');
  return () => createSqliteLifecycleLedger({ filePath, maxRecords });
}
async function command(node, route, data) {
  const r = await fetch(node.relayUrl + route, {
    method: 'POST', headers: { 'content-type':'application/json', ...node.authHeaders() }, body: JSON.stringify(data)
  });
  return { status:r.status, body:await r.json() };
}
async function recover(node) {
  const r = await fetch(node.relayUrl + '/v1/lifecycle/deliveries', { headers:node.authHeaders() });
  return { status:r.status, body:await r.json() };
}
async function newRelay(t, ledger) {
  const relay = createRelay({ localDevelopmentMode:true, lifecycleLedger:ledger });
  const relayUrl = await relay.listen({ port:0 });
  t.after(() => relay.close());
  return { relay, relayUrl };
}
test('G5 signed NEED and RESULT outbox survives restart and requires recipient-authenticated ACK', async (t) => {
  const open=fixture(t), a=open();
  const first=await newRelay(t,a);
  const provider=new TruynNode({relayUrl:first.relayUrl});
  const requester=new TruynNode({relayUrl:first.relayUrl});
  const other=new TruynNode({relayUrl:first.relayUrl});
  await provider.register(); await requester.register(); await other.register();
  await provider.offer('g5.outbox');
  const id='g5-outbox-need';
  const envelope=requester.envelope('NEED',{capability:{name:'g5.outbox'},input:{value:1},policy:{}},{id});
  assert.equal((await command(requester,'/v1/needs',{envelope})).status,200);
  const providerEvents=await recover(provider);
  assert.equal(providerEvents.status,200);
  assert.equal(providerEvents.body.deliveries.length,1);
  assert.equal(providerEvents.body.deliveries[0].eventId,'need:'+id);
  assert.deepEqual(providerEvents.body.deliveries[0].event.envelope,envelope);
  assert.equal((await recover(requester)).body.deliveries.length,0);
  assert.equal((await recover(other)).body.deliveries.length,0);
  assert.equal((await command(other,'/v1/lifecycle/deliveries/ack',{eventId:'need:'+id})).status,404);
  const acked=await command(provider,'/v1/lifecycle/deliveries/ack',{eventId:'need:'+id});
  assert.equal(acked.status,200);
  assert.equal(acked.body.idempotent,false);
  assert.equal((await command(provider,'/v1/lifecycle/deliveries/ack',{eventId:'need:'+id})).body.idempotent,true);
  assert.equal((await recover(provider)).body.deliveries.length,0);
  assert.equal((await provider.poll()).events.filter(e=>e.kind==='NEED').length,1);
  await provider.result(id,{answer:42});
  const result=(await recover(requester)).body.deliveries;
  assert.equal(result.length,1);
  assert.equal(result[0].eventId,'result:'+id);
  assert.equal(result[0].event.kind,'RESULT');
  assert.equal(result[0].event.envelope.payload.requestId,id);
  // A new process sees the same signed event even if the original HTTP reply was lost.
  await first.relay.close();
  const b=open();
  t.after(()=>{a.close();b.close();});
  const second=await newRelay(t,b);
  const requesterAgain=new TruynNode({relayUrl:second.relayUrl,identity:requester.identity});
  const providerAgain=new TruynNode({relayUrl:second.relayUrl,identity:provider.identity});
  await requesterAgain.register(); await providerAgain.register();
  assert.equal((await recover(providerAgain)).body.deliveries.length,0);
  assert.equal((await recover(requesterAgain)).body.deliveries[0].eventId,'result:'+id);
  assert.equal((await command(requesterAgain,'/v1/lifecycle/deliveries/ack',{eventId:'result:'+id})).status,200);
  assert.equal((await recover(requesterAgain)).body.deliveries.length,0);
  assert.equal((await command(requesterAgain,'/v1/needs',{envelope})).status,409);
});
test('G5 durable cancellation never reissues superseded NEED after restart', async(t)=>{
  const open=fixture(t), ledger=open();
  const first=await newRelay(t,ledger);
  const provider=new TruynNode({relayUrl:first.relayUrl});
  const requester=new TruynNode({relayUrl:first.relayUrl});
  await provider.register();await requester.register();await provider.offer('g5.cancel.outbox');
  const id='g5-outbox-revoked';
  const envelope=requester.envelope('NEED',{capability:{name:'g5.cancel.outbox'},input:{},policy:{}},{id});
  assert.equal((await command(requester,'/v1/needs',{envelope})).status,200);
  const revoked=await requester.revoke(id,'no-longer-needed',{targetKind:'need'});
  assert.equal(revoked.cancelled,true);
  assert.equal(ledger.getNeed(id).status,'cancelled');
  assert.deepEqual((await recover(provider)).body.deliveries.map(x=>x.eventId),['revoke:'+id]);
  await first.relay.close();
  const newer=open();
  t.after(()=>{ledger.close();newer.close();});
  const second=await newRelay(t,newer);
  const sameProvider=new TruynNode({relayUrl:second.relayUrl,identity:provider.identity});
  const sameRequester=new TruynNode({relayUrl:second.relayUrl,identity:requester.identity});
  await sameProvider.register();await sameRequester.register();
  assert.deepEqual((await recover(sameProvider)).body.deliveries.map(x=>x.eventId),['revoke:'+id]);
  assert.equal((await command(sameProvider,'/v1/lifecycle/deliveries/ack',{eventId:'revoke:'+id})).status,200);
  assert.equal((await recover(sameProvider)).body.deliveries.length,0);
  assert.equal((await command(sameRequester,'/v1/needs',{envelope})).status,409);
});
test('G5 outbox capacity and invalid envelope roll back reservation atomically', (t)=>{
  const open=fixture(t,1), l=open(); t.after(()=>l.close());
  const spec={id:'atomic-invalid',requester:'a',provider:'b',fingerprint:'a',capability:'x',mode:'legacy'};
  assert.throws(()=>l.reserveNeed({...spec,delivery:{recipient:'wrong',kind:'NEED',event:{kind:'NEED'}}}),
    e=>e.httpStatus===400&&e.publicCode==='invalid_lifecycle_delivery');
  assert.equal(l.getNeed(spec.id),null,'no request may remain after failed outbox insert');
  l.reserveNeed({...spec,delivery:{recipient:'b',kind:'NEED',event:{kind:'NEED',signed:true}}});
  assert.equal(l.pendingDeliveries({recipient:'b'}).length,1);
  assert.throws(()=>l.reserveNeed({...spec,id:'atomic-overflow',delivery:{recipient:'b',kind:'NEED',event:{kind:'NEED'}}}),e=>e.httpStatus===503);
  assert.equal(l.getNeed('atomic-overflow'),null);
});
