import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateCandidate} from '../scripts/truyn1-protocol-candidate-audit.mjs';
const pins=JSON.parse(readFileSync(new URL('../spec/compatibility/truyn1-five-sdk-freeze.json',import.meta.url),'utf8'));
test('five exact published Wire Freeze prereleases are pinned to immutable source, not mistaken for stable SDKs',()=>{
 const report=evaluateCandidate();
 assert.equal(report.sdkCoordinates.length,5);
 assert.equal(report.sdkFrozenSourceSha,'57971b134a41c3e3ea4b42f68e86a7d117036006');
 assert.equal(report.publishedStableSdkVersions,0);
 assert.equal(report.stableProtocolDeclared,false);
 assert.equal(report.p13Format,'PRE_STABLE');
 assert.equal(report.productionCutoverAuthorized,false);
});
test('claiming stable, repinning one SDK or inventing release source fails closed',()=>{
 for(const variant of [
 {...pins,releaseChannel:'STABLE'},
 {...pins,stableProtocolDeclared:true},
 {...pins,coordinates:pins.coordinates.map((x,i)=>i===0?{...x,coordinate:'@truyn/sdk@1.0.0'}:x)},
 {...pins,frozenSourceSha:'f'.repeat(40)}
 ])assert.throws(()=>evaluateCandidate({pins:variant}),/invalid_five_sdk_freeze/);
});
