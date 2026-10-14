import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createIdentity } from '../../../core/identity/index.js';
import { createEnvelope, verifyEnvelope, canonicalize, unsignedEnvelope } from '../src/envelope.ts';
const results: Record<string, unknown> = {};
for (const c of JSON.parse(readFileSync('sdk/conformance/v1/protocol-envelope-golden-fixtures.json', 'utf8')).cases) {
  const verified = verifyEnvelope(c.envelope);
  results[c.id] = { ...verified, canonicalUnsignedSha256: createHash('sha256').update(canonicalize(unsignedEnvelope(c.envelope))).digest('hex') };
}
for (const c of JSON.parse(readFileSync('sdk/conformance/v1/envelope-ext-fixtures.json', 'utf8')).cases) results[c.id] = verifyEnvelope(c.envelope, c);
const identity=createIdentity();
const input={type:'NEED',from:identity.nodeId,publicKeyPem:identity.publicKeyPem,privateKeyPem:identity.privateKeyPem,payload:{input:{query:'Bakı 🚀',topK:42,threshold:0.5}},ext:{priority:'normal'}};
let emissionBlocked=false;try{createEnvelope(input);}catch{emissionBlocked=true;}
const emitted=createEnvelope({...input,negotiatedSemantics:['truyn.envelope.ext/1']});
console.log('WIRE_FREEZE_RESULT ' + JSON.stringify({ language: 'typescript', implementation: 'bundled-node-runtime', results, emitted, emissionBlocked }));
