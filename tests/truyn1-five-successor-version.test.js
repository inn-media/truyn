import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCandidateVersions} from '../sdk/release/validate-candidate-version.mjs';
import {validateReleaseInventory} from '../scripts/check-documentation-consistency.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const current=read('sdk/release/public-coordinates.json'),freeze=read('spec/compatibility/truyn1-five-sdk-freeze.json'),versions=read('sdk/release/version.json'),plan=read('sdk/release/native-successor-candidate.json');
test('five native API successor builds have new versions without rewriting published predecessor evidence',()=>{
 assert.deepEqual(validateCandidateVersions(plan,current,freeze,versions),[]);
 assert.deepEqual(validateReleaseInventory(current,freeze,versions,plan),[]);
 assert.ok(validateReleaseInventory(current,freeze,versions).some(e=>e.includes('version mismatch')));
 assert.equal(current.frozenSourceSha,'57971b134a41c3e3ea4b42f68e86a7d117036006');
 assert.equal(plan.publicationAuthorizedByThisFile,false);
});
test('candidate metadata cannot forge publication, reuse a version, change source or lower qualification',()=>{
 for(const changed of [
  {...plan,publicationState:'accepted'}, {...plan,publicationAuthorizedByThisFile:true},
  {...plan,stableProtocolDeclared:true}, {...plan,predecessorSourceSha:'a'.repeat(40)},
  {...plan,requiredSourceSecurityCases:0}
 ])assert.ok(validateCandidateVersions(changed,current,freeze,versions).length>0);
 const reused={...versions,typescript:current.coordinates.npm.version};
 assert.ok(validateCandidateVersions({...plan,targetVersions:reused},current,freeze,reused).length>0);
 const tampered=structuredClone(current);tampered.coordinates.pypi.publicationState='source-only';
 assert.ok(validateReleaseInventory(tampered,freeze,versions,plan).some(e=>e.includes('publication evidence')));
});
