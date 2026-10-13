import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LANGUAGES, digest, validateRegistration } from './contract.mjs';
import { validateArtifactMatrix } from './artifact-contract.mjs';
import { validateLifecycle } from '../lifecycle-peer/matrix-contract.mjs';
import { qualifySourceLifecycle } from '../lifecycle-peer/source-contract.mjs';
export function validateOldNew(root,context,build,read=(name)=>readFileSync(resolve(root,name))) {
  const raw=read('report.json'),inputs=JSON.parse(raw);
  assert.equal(inputs.schema,'truyn.old-new-package-inputs/v1');assert.deepEqual(inputs.context,context);
  assert.deepEqual(inputs.packages,build.packages);assert.equal(inputs.buildProofSha256,digest(JSON.stringify(build,null,2)+'\n'));
  assert.deepEqual(inputs.packageModes,{legacy:'verified-published-predecessor',candidate:'verified-new-build-archive'});
  const pins=readFileSync(new URL('../../../spec/compatibility/truyn1-five-sdk-digests.json',import.meta.url));
  assert.equal(inputs.publishedSdkSourceSha,'57971b134a41c3e3ea4b42f68e86a7d117036006');
  assert.equal(inputs.predecessorReceipts?.length,5);
  assert.deepEqual(inputs.predecessorReceipts.map(r=>r.id).sort(),[...LANGUAGES].sort());
  const frozen=JSON.parse(pins).packages;
  for(const receipt of inputs.predecessorReceipts){
    assert.deepEqual(receipt.context,context);assert.equal(receipt.status,'PASS');assert.equal(receipt.pinsSha256,digest(pins));
    const pin=frozen[receipt.id];assert.equal(receipt.coordinate,pin.coordinate);assert.equal(receipt.comparison,pin.mode);
    assert.match(receipt.archiveSha256,/^[a-f0-9]{64}$/);assert.ok(Number.isSafeInteger(receipt.archiveBytes)&&receipt.archiveBytes>0);
    if(pin.mode==='archive-sha256'){assert.equal(receipt.archiveSha256,pin.sha256);assert.equal(receipt.archiveBytes,pin.bytes);}
    else assert.equal(receipt.checkedPayloadFiles,Object.keys(pin.files).length);
  }
  const registrationBytes=read('registration.json'),artifactBytes=read('artifacts.json'),lifecycleBytes=read('lifecycle.json');
  const registration=validateRegistration(JSON.parse(registrationBytes),context,raw);
  const artifacts=validateArtifactMatrix(JSON.parse(artifactBytes),context,raw);
  const lifecycle=JSON.parse(lifecycleBytes);assert.equal(lifecycle.packagesReportSha256,digest(raw));
  const counts=validateLifecycle(lifecycle,context),candidate=qualifySourceLifecycle(lifecycle,context);
  assert.equal(counts.fail,0);
  return {schema:'truyn.old-new-package-compatibility/v1',context,status:'BOUNDED_PASS_WITH_HISTORICAL_LIMITS',
    packageModes:inputs.packageModes,predecessorReceipts:inputs.predecessorReceipts,packages:inputs.packages,
    inputsSha256:digest(raw),registrationSha256:digest(registrationBytes),artifactsSha256:digest(artifactBytes),lifecycleSha256:digest(lifecycleBytes),
    registration,artifacts,lifecycle:counts,newPackageLifecycleCases:candidate.scenarios,newPackageSecurityCases:candidate.securityScenarios,
    newPackagesPublished:false,stableProtocolDeclared:false,productionCutoverAuthorized:false};
}
