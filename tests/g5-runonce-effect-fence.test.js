import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSqliteLifecycleLedger } from '../network/relay/durable-lifecycle-ledger.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';

test('G5 runOnce uses same durable provider effect fence as continuous workers', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'truyn-g5-runonce-'));
  t.after(() => rmSync(dir, { recursive:true, force:true }));
  const ledger = createSqliteLifecycleLedger({ filePath:path.join(dir,'effect.sqlite') });
  t.after(() => ledger.close());
  const id = 'one-shot-paid-opaque';
  const event = {
    kind:'NEED', verification:{ok:true},
    envelope:{ id, from:'requester', payload:{capability:{name:'g5.once'}, input:{x:1}, policy:{}} }
  };
  let externalExecutions=0, bills=0, terminals=0;
  const node = {
    identity:{nodeId:'provider-node'},
    sessionToken:'session',
    register:async()=>({ok:true}),
    offer:async()=>({offerId:'offer-once'}),
    poll:async()=>({events:[event]}),
    result:async()=>{ terminals++; return {ok:true}; }
  };
  const host = new TruynAdapterHost({
    node,
    adapter:createFunctionAdapter({capabilities:['g5.once'],execute:async()=>{externalExecutions++;return {output:{ok:true}};}}),
    accessPolicy:{mode:'test',authorize:()=>({ok:true})},
    billingPolicy:{mode:'test',authorize:async()=>{bills++;return {ok:true};}},
    effectLedger:ledger
  });
  assert.equal((await host.runOnce()).handled,1);
  assert.equal(externalExecutions,1);
  assert.equal(terminals,1);
  assert.equal(ledger.getEffect(id).status,'completed');
  // Signed redelivery on next poll has the same ID; no billing or work.
  assert.equal((await host.runOnce()).handled,1);
  assert.equal(externalExecutions,1);
  assert.equal(bills,1);
  assert.equal(terminals,1);
  // New host process against the same file remains fenced.
  const secondLedger = createSqliteLifecycleLedger({filePath:path.join(dir,'effect.sqlite')});
  t.after(()=>secondLedger.close());
  const recovered = new TruynAdapterHost({
    node, adapter:host.adapter,
    accessPolicy:host.accessPolicy,
    billingPolicy:host.billingPolicy,
    effectLedger:secondLedger
  });
  await recovered.runOnce();
  assert.equal(externalExecutions,1);
});

test('G5 one-shot does not settle paid work when effect intent storage fails', async(t)=>{
  const dir=mkdtempSync(path.join(tmpdir(),'truyn-g5-runonce-deny-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const ledger=createSqliteLifecycleLedger({filePath:path.join(dir,'effect.sqlite'),maxRecords:1});
  t.after(()=>ledger.close());
  ledger.beginEffect({id:'already-admitted',provider:'provider',requester:'requester',fingerprint:'prior'});
  let executed=0,billed=0;
  const need={id:'g5-denied-capacity',from:'requester',payload:{capability:'g5.once',input:{}}};
  const node={
    identity:{nodeId:'provider'},sessionToken:'token',register:async()=>({}),
    offer:async()=>({offerId:'g5-offer'}),
    poll:async()=>({events:[{kind:'NEED',verification:{ok:true},envelope:need}]}),
    result:async()=>({})
  };
  const host=new TruynAdapterHost({
    node,adapter:createFunctionAdapter({capabilities:['g5.once'],execute:async()=>{executed++;return true;}}),
    effectLedger:ledger,
    accessPolicy:{mode:'test',authorize:()=>({ok:true})},
    billingPolicy:{mode:'test',authorize:async()=>{billed++;return {ok:true};}}
  });
  await assert.rejects(()=>host.runOnce(),(e)=>e.publicCode==='effect_idempotency_capacity_reached');
  assert.equal(executed,0);
  assert.equal(billed,0);
});

test('G5 ambiguous external effect must not be falsely settled or terminalized by provider', async(t)=>{
  const dir=mkdtempSync(path.join(tmpdir(),'truyn-g5-ambiguous-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const ledger=createSqliteLifecycleLedger({filePath:path.join(dir,'effect.sqlite')});
  t.after(()=>ledger.close());
  const need={id:'g5-remote-transport-ambiguous',from:'requester',payload:{capability:'g5.ambiguous',input:{}}};
  let calls=0,settlements=0,terminal=0;
  const node={
    identity:{nodeId:'provider'},sessionToken:'live',register:async()=>({ok:true}),offer:async()=>({offerId:'offer'}),
    poll:async()=>({events:[{kind:'NEED',verification:{ok:true},envelope:need}]}),
    result:async()=>{terminal++;return {ok:true};}
  };
  const adapter=createFunctionAdapter({capabilities:['g5.ambiguous'],execute:async()=>{
    calls++;
    throw new Error('transport timeout after unknown remote side effect');
  }});
  const billing={mode:'test',authorize:async()=>({ok:true,finalize:async()=>{settlements++;}})};
  const host=new TruynAdapterHost({
    node,adapter,effectLedger:ledger,
    accessPolicy:{mode:'test',authorize:()=>({ok:true})},billingPolicy:billing
  });
  await host.runOnce();
  assert.equal(calls,1);
  assert.equal(ledger.getEffect(need.id).status,'unknown');
  assert.equal(terminal,0,'must not publish irreversible failed RESULT while remote outcome is unknown');
  assert.equal(settlements,0,'must not finalize/refund billing from ambiguous remote outcome');
  await host.runOnce();
  assert.equal(calls,1,'duplicate signed NEED remains fenced until reconciliation');
  assert.equal(terminal,0);
});

test('G5 asynchronous effect reservation must resolve before billing or provider call', async ()=>{
  let billed=0, executed=0, terminal=0;
  const need={id:'async-fence-rejected',from:'requester',payload:{capability:'g5.async',input:{}}};
  const node={identity:{nodeId:'p'},sessionToken:'t',register:async()=>({}),offer:async()=>({offerId:'offer'}),
    poll:async()=>({events:[{kind:'NEED',verification:{ok:true},envelope:need}]}),result:async()=>{terminal++;}};
  const host=new TruynAdapterHost({
    node,adapter:createFunctionAdapter({capabilities:['g5.async'],execute:async()=>{executed++;return {};}}),
    effectLedger:{beginEffect:async()=>{await Promise.resolve();return {acquired:false,existing:{status:'started'}};},finishEffect:async()=>{throw Error('unreachable');}},
    accessPolicy:{mode:'test',authorize:()=>({ok:true})},
    billingPolicy:{mode:'test',authorize:async()=>{billed++;return {ok:true};}}
  });
  await host.runOnce();
  assert.equal(billed,0);
  assert.equal(executed,0);
  assert.equal(terminal,0);
});
