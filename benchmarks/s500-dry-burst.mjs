// Zero-inference relay test. Hold every NEED until every ACK has arrived.
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
const { createRelay } = await import(process.env.S500_DRY_RELAY_MODULE || '../network/relay/server.js');
import { TruynNode } from '../node/client.js';
import { performance } from 'node:perf_hooks';

const count = Number(process.env.S500_DRY_COUNT || 500);
const providerCount = 8;
const relay = createRelay({ localDevelopmentMode: true, maxNodes: 1024, maxOffers: 8192,
  maxFastTerminalReservationsPerRequester: 1024, socketHeartbeatIntervalMs: 3000 });
const url = await relay.listen({ port: 0 });
const requester = new TruynNode({ relayUrl: url, identity: createIdentity() });
const providers = [];
const percentile = (values, p) => [...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
let release;
const barrier = new Promise(resolve => { release = resolve; });
try {
  await requester.register();
  await requester.ensureFastSocket();
  for (let i = 0; i < providerCount; i++) {
    const node = new TruynNode({ relayUrl: url, identity: createIdentity() });
    await node.register(); await node.ensureFastSocket(); providers.push(node);
  }
  for (let i = 0; i < count; i++) await providers[i%providerCount].offer(`dry.node-${i}`, { accessMode:'owner-only', allowedRequesterIds:[requester.identity.nodeId] });
  const ack = [], dispatch = [], received = new Map();
  const workers = providers.map((node, ordinal) => (async () => {
    const tasks = [];
    for (let i = ordinal; i < count; i += providerCount) {
      const event = await node.nextSocketEvent({ timeoutMs: 30000 });
      assert.equal(event.kind, 'NEED'); assert(event.verification.ok);
      received.set(event.frame.i, performance.now());
      tasks.push((async () => { await barrier; await node.compactResult(event.frame.i, event.payload.input, { simulated:true, paidCalls:0 }); })());
    }
    await Promise.all(tasks);
  })());
  const starts = new Map();
  const settled = await Promise.allSettled(Array.from({length:count}, async (_,i) => {
    const started = performance.now();
    const receipt = await requester.compactNeed(`dry.node-${i}`, {i}, {}, {waitMs:0});
    starts.set(receipt.needId, started); ack.push(performance.now()-started);
    return {receipt,i};
  }));
  const accepted = settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
  const errors = settled.filter(x=>x.status==='rejected').map(x=>String(x.reason));
  assert.equal(accepted.length,count,JSON.stringify(errors.slice(0,3)));
  // The provider queue can lag behind ACKs; release only after all 500 NEEDs are received.
  const deadline=performance.now()+30000;
  while(received.size<count && performance.now()<deadline) await new Promise(r=>setTimeout(r,5));
  assert.equal(received.size,count);
  for(const [id,at] of received) dispatch.push(at-starts.get(id));
  const expected=new Map(accepted.map(({receipt,i})=>[receipt.needId,i]));
  const completions=(async()=>{
    const ids=[];
    for(let k=0;k<count;k++){
      const event=await requester.nextSocketEvent({timeoutMs:30000});
      assert.equal(event.kind,'RESULT');assert(event.verification.ok);
      const i=expected.get(event.frame.i);assert(Number.isInteger(i));
      assert.equal(event.payload.output.i,i);
      assert.equal(event.from,providers[i%providerCount].identity.nodeId);
      ids.push(event.frame.i);
    }
    return ids;
  })();
  release();
  const result=await completions; await Promise.all(workers);
  assert.equal(new Set(result).size,count);
  console.log(JSON.stringify({schema:'truyn.s500.dry-burst/v1',count,accepted:count,completed:result.length,
    paidCalls:0,terminalBackpressure:0,ackP50Ms:percentile(ack,.5),ackP95Ms:percentile(ack,.95),dispatchP95Ms:percentile(dispatch,.95),
    ackBySlice:Array.from({length:5},(_,j)=>({slice:j,p50Ms:percentile(ack.slice(j*count/5,(j+1)*count/5),.5)})),status:'PASS'}));
} finally { release?.(); for(const p of providers)p.fastSocket?.close();requester.fastSocket?.close();await relay.close(); }
