import test from 'node:test';
import assert from 'node:assert/strict';
import {negotiateProtocol} from '../core/protocol/negotiation.js';
import {createIdentity} from '../core/identity/index.js';
import {createSessionHello,verifySessionHello} from '../network/sessions/authenticated-session.js';
const mismatch={ok:false,code:'version_mismatch',reason:'no_protocol_overlap'};
test('P11 rejects malformed or unsafe shared generation names instead of granting negotiated protocol',()=>{
 for(const value of ['TRUYN/0','TRUYN/01','TRUYN/0001','TRUYN/9007199254740992','TRUYN/9999999999999999999999','TRUYN/1-preview','UNKNOWN','TRUYN/-1'])
  assert.deepEqual(negotiateProtocol({localProtocols:[value],remoteProtocols:[value]}),mismatch,value);
});
test('P11 malformed but signed generation does not become authenticated session',()=>{
 const identity=createIdentity();
 const bad=createSessionHello({identity,protocols:['TRUYN/01']});
 const decision=verifySessionHello(bad,{localProtocols:['TRUYN/01']});
 assert.equal(decision.ok,false);
 assert.equal(decision.code,'version_mismatch');
 const valid=createSessionHello({identity,protocols:['TRUYN/1']});
 assert.equal(verifySessionHello(valid).ok,true);
});
test('P11 generation-specific semantics cannot be borrowed from a different generation',()=>{
 const inScope={localProtocols:['TRUYN/1','TRUYN/2'],remoteProtocols:['TRUYN/1','TRUYN/2'],
  requiredSemantics:['revoke-need'],localSemanticsByProtocol:{'TRUYN/1':['revoke-need'],'TRUYN/2':[]},
  remoteSemanticsByProtocol:{'TRUYN/1':['revoke-need'],'TRUYN/2':[]}};
 assert.deepEqual(negotiateProtocol(inScope),{ok:false,code:'version_mismatch',reason:'required_semantic_unavailable',protocol:'TRUYN/2',missingSemantics:['revoke-need']});
 const only1={...inScope,remoteProtocols:['TRUYN/1']};
 assert.deepEqual(negotiateProtocol(only1),{ok:true,protocol:'TRUYN/1',semantics:['revoke-need']});
 const unilateral={...inScope,remoteSemanticsByProtocol:undefined};
 assert.deepEqual(negotiateProtocol(unilateral),{ok:false,code:'version_mismatch',reason:'invalid_semantic_advertisement'});
 const missing={...inScope,localSemanticsByProtocol:{'TRUYN/1':['revoke-need']}};
 assert.deepEqual(negotiateProtocol(missing),{ok:false,code:'version_mismatch',reason:'invalid_semantic_advertisement'});
});
