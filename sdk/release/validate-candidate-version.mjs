// Read-only declaration consistency, never a publication or release admission.
const KEYS=['channel','goTag','protocol','python','release','stableSdkApiVersion','typescript'];
const coordinateFields={npm:'typescript',pypi:'python',go:'goTag',maven:'release',nuget:'release'};
function parts(value,python=false){
 if(typeof value!=='string')return null;
 const match=(python?/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)a([1-9]\d*)$/:/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-alpha\.([1-9]\d*)$/).exec(value);
 if(!match)return null;const list=match.slice(1).map(Number);return list.every(Number.isSafeInteger)?list:null;
}
function greater(left,right){for(let i=0;i<left.length;i++){if(left[i]>right[i])return true;if(left[i]<right[i])return false;}return false;}
export function validateCandidateVersions(candidate,current,freeze,versions){
 const errors=[];
 if(candidate?.schema!=='truyn.sdk-successor-candidate/v1'||candidate.intent!=='build-unpublished-native-lifecycle-successor'||candidate.publicationState!=='unpublished'||candidate.predecessorSourceSha!==freeze?.frozenSourceSha||candidate.predecessorSourceSha!==current?.frozenSourceSha||candidate.stableProtocolDeclared!==false||candidate.productionCutoverAuthorized!==false||candidate.publicationAuthorizedByThisFile!==false||candidate.requiredSourceLifecycleCases!==20||candidate.requiredSourceSecurityCases!==30)return ['invalid unpublished SDK candidate declaration'];
 if(!candidate.targetVersions||!versions||Object.keys(candidate.targetVersions).sort().join(',')!==KEYS.join(',')||KEYS.some(k=>candidate.targetVersions[k]!==versions[k])||versions.protocol!=='TRUYN/1'||versions.stableSdkApiVersion!=='1'||versions.channel!=='public-pre-release')return ['candidate/build version contract mismatch'];
 for(const [registry,field] of Object.entries(coordinateFields)){
  const old=current.coordinates?.[registry]?.version;
  let next=versions[field];if(registry==='go'){if(typeof next!=='string'||!next.startsWith('sdk/go/v')){errors.push('invalid successor Go tag');continue;}next=next.slice('sdk/go/v'.length);}
  const a=parts(next,registry==='pypi'),b=parts(registry==='go'?String(old).replace(/^v/,''):old,registry==='pypi');
  if(!a||!b||!greater(a,b))errors.push('successor version must be a distinct newer prerelease: '+registry);
 }
 return errors;
}
