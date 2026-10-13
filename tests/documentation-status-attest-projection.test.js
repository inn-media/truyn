import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ATTEST_VERDICTS, ATTEST_PROTOCOL } from '../core/claims/index.js';

const mapping = JSON.parse(readFileSync('spec/registry/truyn1-attest-verdict-projection.json','utf8'));
const proto = readFileSync('proto/v1/attest.proto','utf8');
const spec = readFileSync('spec/protocol/v1/attest.md','utf8');

test('signed attestation verdicts are exactly the immutable lowercase JSON values', () => {
  assert.equal(ATTEST_PROTOCOL,'truyn-attest-v1');
  assert.deepEqual(ATTEST_VERDICTS,['support','contradict','uncertain']);
  assert.equal(mapping.status,'CLASS_C_PROPOSAL_NO_NEW_CRYPTO_DOMAIN');
  assert.equal(mapping.entries.length,3);
  assert.equal(mapping.unspecified.enumValue,0);
  assert.equal(mapping.unspecified.admission,'REJECT');
  assert.equal(mapping.compatibility.signatureDomainUnchanged,true);
  assert.equal(mapping.compatibility.protobufTransportAdmitted,false);
  assert.equal(mapping.compatibility.uppercaseSignedValuesAccepted,false);
  for(const [i, entry] of mapping.entries.entries()) {
    assert.equal(entry.implementedSignedValue,ATTEST_VERDICTS[i]);
    assert.equal(entry.enumValue,i+1);
    const match = proto.match(new RegExp('\\b'+entry.enumName+'\\s*=\\s*(\\d+)\\s*;'));
    assert.ok(match,'missing proto enum '+entry.enumName);
    assert.equal(Number(match[1]),entry.enumValue);
    assert.ok(!ATTEST_VERDICTS.includes(entry.conceptualLabel));
    assert.ok(spec.includes(entry.implementedSignedValue));
  }
  assert.match(proto,/ATTESTATION_UNSPECIFIED\s*=\s*0\s*;/);
  assert.match(spec,/protobuf.*projection/i);
});
