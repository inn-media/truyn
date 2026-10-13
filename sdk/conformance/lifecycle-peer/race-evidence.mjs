import assert from 'node:assert/strict';
import {verifyEnvelope} from '../../../core/protocol/index.js';

// Inputs are in-memory proxy traces for this race ONLY, never serialized to artifacts.
export function verifyTerminalRace({needId,provider,requester,terminalState,rpc,providerTrace,requesterTrace}) {
  assert.equal(providerTrace.length,1,'RESULT contender must reach relay exactly once');
  assert.equal(requesterTrace.length,1,'REVOKE contender must reach relay exactly once');
  const [result,revoke]=[providerTrace[0],requesterTrace[0]];
  assert.equal(result.method,'POST');assert.equal(result.path,'/v1/results');
  assert.equal(revoke.method,'POST');assert.equal(revoke.path,'/v1/revoke');
  const re=JSON.parse(result.bytes).envelope,ce=JSON.parse(revoke.bytes).envelope;
  assert.equal(verifyEnvelope(re).ok,true);assert.equal(verifyEnvelope(ce).ok,true);
  assert.equal(re.type,'RESULT');assert.equal(re.from,provider);assert.equal(re.payload.requestId,needId);
  assert.equal(ce.type,'REVOKE');assert.equal(ce.from,requester);assert.equal(ce.payload.targetId,needId);assert.equal(ce.payload.targetKind,'need');
  assert.deepEqual([result.status,revoke.status].sort((a,b)=>a-b),[200,409],
    'one relay success and one real relay conflict are required, not an actor/network error');
  assert.equal(rpc.length,2);
  assert.equal(rpc[0].ok,result.status===200);assert.equal(rpc[1].ok,revoke.status===200);
  if(result.status===200){
    assert.equal(terminalState,'completed');assert.equal(revoke.reply.error,'request_already_completed');
  }else{
    assert.equal(terminalState,'cancelled');assert.equal(result.reply.error,'request_cancelled');
  }
  return {resultHttpStatus:result.status,revokeHttpStatus:revoke.status,terminalState};
}
