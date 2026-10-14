import assert from 'node:assert/strict';
import { mkdirSync, copyFileSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { LANGUAGES, digest } from './contract.mjs';
import { validateOldNew } from './old-new-contract.mjs';

// Called after installing and testing the exact successor archives. Preserve
// those compiled peers before installing immutable old packages separately.
export function qualifyOldNewPackages(stage,dist,build,baseEnv) {
  const root=resolve('.'),directory=join(stage,'old-new'),evidence=join(directory,'five-sdk-evidence');
  mkdirSync(evidence,{recursive:true});
  copyFileSync('/tmp/truyn-lifecycle-legacy-go',join(directory,'new-go'));
  cpSync('/tmp/truyn-lifecycle-legacy-java',join(directory,'new-java'),{recursive:true});
  cpSync(resolve('sdk/conformance/lifecycle-peer/dotnet/legacy/bin/Release/net8.0'),join(directory,'new-dotnet'),{recursive:true});
  const env={...baseEnv,TRUYN_OLD_NEW_STAGE:directory,RUNNER_TEMP:directory,TRUYN_REGISTRATION_REQUIRE_ALL:'false',
    TRUYN_LEGACY_NPM_ROOT:join(directory,'old-npm'),TRUYN_CANDIDATE_NPM_ROOT:join(stage,'npm'),
    TRUYN_LEGACY_PYTHON:join(directory,'old-python/bin/python'),TRUYN_CANDIDATE_PYTHON:join(stage,'python-package/bin/python'),
    TRUYN_LEGACY_NATIVE_GO:join(directory,'old-go/peer'),TRUYN_CANDIDATE_NATIVE_GO:join(directory,'new-go'),
    TRUYN_LEGACY_JAVA_CP:join(directory,'old-java')+':'+join(directory,'old-java/sdk.jar'),
    TRUYN_CANDIDATE_JAVA_CP:join(directory,'new-java')+':'+join(dist,'java/truyn-sdk-'+build.versions.release+'.jar'),
    TRUYN_LEGACY_NATIVE_DOTNET:join(root,'sdk/conformance/lifecycle-peer/dotnet/legacy/bin/Release/net8.0/LegacyLifecycle.dll'),
    TRUYN_CANDIDATE_NATIVE_DOTNET:join(directory,'new-dotnet/LegacyLifecycle.dll')};
  const run=(command,args)=>{const p=spawnSync(command,args,{env,stdio:'inherit',timeout:300000});if(p.error||p.status!==0)throw p.error||Error('old/new package execution failed: '+command);};
  run('bash',['sdk/conformance/registration-peer/prepare-old-packages.sh']);
  const receipts=LANGUAGES.map(l=>JSON.parse(readFileSync(join(directory,'receipts',l+'.json'))));
  const inputs={schema:'truyn.old-new-package-inputs/v1',context:build.context,status:'PASS',packages:build.packages,
    buildProofSha256:digest(JSON.stringify(build,null,2)+'\n'),publishedSdkSourceSha:'57971b134a41c3e3ea4b42f68e86a7d117036006',
    predecessorReceipts:receipts,packageModes:{legacy:'verified-published-predecessor',candidate:'verified-new-build-archive'}};
  writeFileSync(join(evidence,'report.json'),JSON.stringify(inputs,null,2)+'\n',{flag:'wx'});
  run(process.execPath,['sdk/conformance/lifecycle-peer/run.mjs']);
  run(process.execPath,['sdk/conformance/registration-peer/run.mjs']);
  run(process.execPath,['sdk/conformance/registration-peer/artifacts.mjs']);
  const report=validateOldNew(evidence,build.context,build);
  assert.equal(report.newPackageLifecycleCases,20);assert.equal(report.newPackageSecurityCases,30);
  for(const name of ['report.json','registration.json','artifacts.json','lifecycle.json'])copyFileSync(join(evidence,name),join(dist,'old-new-package-'+name));
  writeFileSync(join(dist,'old-new-package-proof.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(report));
}
