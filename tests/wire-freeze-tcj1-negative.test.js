import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { canonicalize, createEnvelope, verifyEnvelope, nodeIdFromPublicKey } from '../core/protocol/index.js';

const keypair = generateKeyPairSync('ed25519');
const publicKeyPem = keypair.publicKey.export({type:'spki',format:'pem'}).toString();
const privateKeyPem = keypair.privateKey.export({type:'pkcs8',format:'pem'}).toString();
const from = nodeIdFromPublicKey(publicKeyPem);
const signNeed = () => createEnvelope({
  type:'NEED',from,publicKeyPem,privateKeyPem,id:'wire-freeze-legacy-1',
  createdAt:'2026-10-11T12:00:00.000Z',payload:{capability:{name:'research'},input:{query:'R&D <b> 🚀 Bakı',topK:42},policy:{}}
});

test('TCJ1 canonicalization remains byte-exact on legacy signed message edge classes', () => {
  const vectors = [
    [{a:'b',c:1},'{"a":"b","c":1}'],
    [{q:'R&D <b>'},'{"q":"R&D <b>"}'],
    [{q:'🚀'},'{"q":"🚀"}'],
    [{n:1.0},'{"n":1}'],
    [{n:1e-7},'{"n":1e-7}'],
    [{n:2.5e-5},'{"n":0.000025}'],
    [{n:1e21},'{"n":1e+21}'],
    [{n:-0},'{"n":0}'],
    [{b:1,B:2,a:3,_:4,aa:5},'{"B":2,"_":4,"a":3,"aa":5,"b":1}'],
    [{q:'a\u2028b\u2029c'},'{"q":"a\u2028b\u2029c"}']
  ];
  for (const [input,expected] of vectors) assert.equal(canonicalize(input),expected);
});

test('baseline signatures do not change under verification, and tampering cannot pass', () => {
  const envelope=signNeed();
  assert.deepEqual(verifyEnvelope(envelope),{ok:true});
  assert.deepEqual(verifyEnvelope({...envelope,payload:{...envelope.payload,input:{query:'tampered'}}}),{ok:false,reason:'invalid_signature'});
  assert.deepEqual(verifyEnvelope({...envelope,to:'truyn:node:'+'0'.repeat(64)}),{ok:false,reason:'invalid_signature'});
  assert.deepEqual(verifyEnvelope({...envelope,type:'UNKNOWN'}),{ok:false,reason:'unsupported_type'});
  assert.deepEqual(verifyEnvelope({...envelope,from:'truyn:node:'+'0'.repeat(64)}),{ok:false,reason:'node_id_key_mismatch'});
});

test('signed ext is protected by signature even without opt-in ext semantic enforcement', () => {
  const envelope=signNeed();
  const unsigned={...envelope,ext:{traceId:'4bf92f3577b34da6a3ce929d0e0e4736',priority:'normal'}};
  // Existing verifier must not silently ignore an unknown signed field after signing.
  assert.deepEqual(verifyEnvelope(unsigned),{ok:false,reason:'invalid_signature'});
  assert.deepEqual(verifyEnvelope(envelope),{ok:true});
});

test('missing optional to remains a compatible signed form when signed without to', () => {
  const envelope=signNeed();
  const withoutTo={...envelope}; delete withoutTo.to;
  assert.deepEqual(verifyEnvelope(withoutTo),{ok:false,reason:'invalid_signature'});
  // A signed field cannot be dropped by a relay even if optional in the schema.
});
