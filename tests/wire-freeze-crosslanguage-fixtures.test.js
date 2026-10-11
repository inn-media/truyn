import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalize } from '../core/protocol/index.js';

const vectors=JSON.parse(readFileSync(new URL('../sdk/conformance/v1/tcj1-wire-freeze-vectors.json',import.meta.url),'utf8'));
test('TCJ1 canonical vectors are exact UTF-8 bytes for every language consumer',()=>{
 assert.equal(vectors.schema,'truyn.tcj1.cross-language-golden/1');
 assert.ok(vectors.cases.length>=14);
 for(const c of vectors.cases){
   assert.deepEqual(Buffer.from(canonicalize(c.input),'utf8'),Buffer.from(c.canonicalUnsigned,'utf8'),c.id);
 }
});
