// Release-candidate inventory only. Never grants Stable TRUYN/1 or production access.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateP13FormatReadiness} from './p13-format-readiness.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const canonical=[
 ['typescript','@truyn/sdk@0.1.0-alpha.5'],
 ['python','truyn-sdk==0.1.0a2'],
 ['go','github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.2'],
 ['java','org.truyn:truyn-sdk:0.1.0-alpha.2'],
 ['dotnet','Truyn.Sdk 0.1.0-alpha.2']
];
export function evaluateCandidate({pins=read('spec/compatibility/truyn1-five-sdk-freeze.json'),
  format=read('spec/compatibility/p13-format-compatibility-plan.json')}={}){
 if(pins.schema!=='truyn.protocol1.five-sdk-freeze/v1'
 || pins.releaseChannel!=='PUBLIC_PRERELEASE_ONLY'
 || pins.stableProtocolDeclared!==false
 || pins.frozenSourceSha!=='57971b134a41c3e3ea4b42f68e86a7d117036006'
 || pins.bundleRunId!==38154701595
 || pins.publicRegistryEvidenceCount!==5
 || pins.registryEvidence!=='docs/releases/WIRE_FREEZE_FIVE_SDK_REGISTRY_2026-10-11.md'
 || !Array.isArray(pins.coordinates)
 || pins.coordinates.length!==5
 || canonical.some(([id,coord])=>pins.coordinates.filter(x=>x.id===id&&x.coordinate===coord).length!==1))
 throw Error('invalid_five_sdk_freeze');
 const source=readFileSync(resolve(root,pins.registryEvidence),'utf8');
 if(!source.includes(pins.frozenSourceSha)
 || canonical.some(([id,coord])=>!source.includes(coord)))
 throw Error('five_sdk_registry_record_mismatch');
 const report=evaluateP13FormatReadiness(format);
 const ledger=readFileSync(resolve(root,'docs/compatibility/TRUYN1_RC_GAP_LEDGER.md'),'utf8');
 for(const gate of ['P6','P7','P8','P9','P11','P13','P14']){
  if(!new RegExp('\\| '+gate+' \\|').test(ledger))throw Error('missing_protocol_gate:'+gate);
 }
 return {schema:'truyn.protocol1.candidate-audit/v1',scope:'STABLE_TRUYN1_PROTOCOL',
  status:'NOT_ADMITTED',p6p9:'TARGETED_CONFORMANCE_PENDING_EXACT_SHA',
  p11:'RC1_WITH_ADDITIONAL_NEGATIVES_PENDING_EXACT_SHA',
  p13Format:report.status,p14:'DRAFT_UNCHANGED',sdkChannel:pins.releaseChannel,
  sdkFrozenSourceSha:pins.frozenSourceSha,sdkCoordinates:pins.coordinates.map(x=>x.coordinate),
  exactCurrentShaCertified:false,publishedStableSdkVersions:0,
  stableProtocolDeclared:false,productionCutoverAuthorized:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 process.stdout.write(JSON.stringify(evaluateCandidate(),null,2)+'\n');
