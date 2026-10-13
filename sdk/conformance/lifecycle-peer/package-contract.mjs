import {createHash} from 'node:crypto';
import {lstatSync,readFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {qualifySourceLifecycle} from './source-contract.mjs';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function validateBuildBundle(manifest,context,versions,root){
 if(manifest?.schema!=='truyn.sdk-release/v1'||manifest.sourceSha!==context.sourceSha||!/^[a-f0-9]{40}$/.test(context.sourceSha)||!/^[a-f0-9]{40}$/.test(context.sourceTree))throw Error('package_source_mismatch');
 for(const key of ['release','typescript','python','goTag','protocol','stableSdkApiVersion','channel'])if(manifest[key]!==versions[key])throw Error('package_version_drift:'+key);
 if(versions.channel!=='public-pre-release'||!Array.isArray(manifest.artifacts)||manifest.artifacts.length<5)throw Error('invalid_package_manifest');
 const names=new Set();
 for(const a of manifest.artifacts){
  if(typeof a.path!=='string'||a.path.includes('..')||a.path.includes('\\')||!/^((typescript|python|go|java|dotnet)\/)[^/]+$/.test(a.path)||names.has(a.path)||!Number.isSafeInteger(a.bytes)||a.bytes<1||!/^[a-f0-9]{64}$/.test(a.sha256))throw Error('invalid_package_entry');
  names.add(a.path);const p=resolve(root,a.path);if(!p.startsWith(resolve(root)+sep))throw Error('package_path_escape');
  const stat=lstatSync(p);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==a.bytes||digest(readFileSync(p))!==a.sha256)throw Error('package_bytes_mismatch:'+a.path);
 }
 const targets={typescript:'typescript/truyn-sdk-'+versions.typescript+'.tgz',python:'python/truyn_sdk-'+versions.python+'-py3-none-any.whl',go:'go/truyn-sdk-go-'+versions.release+'.tar.gz',java:'java/truyn-sdk-'+versions.release+'.jar',dotnet:'dotnet/Truyn.Sdk.'+versions.release+'.nupkg'};
 return Object.entries(targets).map(([language,path])=>{const row=manifest.artifacts.find(a=>a.path===path);if(!row)throw Error('missing_native_package:'+language);return {language,...row};});
}
export function qualifyPackagedLifecycle(lifecycle,build,context){
 const source=qualifySourceLifecycle(lifecycle,context);
 if(build?.schema!=='truyn.unpublished-native-sdk-build/v1'||!same(build.context,context)||build.status!=='PASS'||build.publicationState!=='unpublished'||build.publishedSdkSourceSha!==null||build.packages?.length!==5||new Set(build.packages.map(x=>x.language)).size!==5)throw Error('package_build_proof_mismatch');
 if(lifecycle.publishedSdkSourceSha!==null||lifecycle.packagesReportSha256!==digest(Buffer.from(JSON.stringify(build,null,2)+'\n')))throw Error('package_lifecycle_binding_mismatch');
 if(lifecycle.status!=='PASS'||lifecycle.outcomes.length!==80||lifecycle.outcomes.some(x=>x.status!=='PASS')||source.publishedBlockedCells!==0)throw Error('packaged_lifecycle_incomplete');
 return {schema:'truyn.packaged-native-lifecycle/v1',context,status:'PASS',publicationState:'unpublished',packageModes:{legacy:'verified-new-build-archive',candidate:'exact-source'},cases:80,securityCases:30,negotiationCases:10,packages:build.packages,versions:build.versions,manifestSha256:build.manifestSha256,stableProtocolDeclared:false,productionCutoverAuthorized:false};
}
