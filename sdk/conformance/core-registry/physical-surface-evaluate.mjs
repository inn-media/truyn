// Exact-run functional inventory, not a stable admission or a synthetic native SDK.
import assert from 'node:assert/strict';
export const LANGUAGES=Object.freeze(['typescript','python','go','java','dotnet']);
export const MODES=Object.freeze(['legacy','candidate']);
export const ACTIVE_CODES=Object.freeze([
  '21000000','22000000','23000000','24000000','25000000',
  '41000000','42000000','43000000','44000000','45000000','46000000'
]);
const DIRECT_NATIVE=new Set(['41000000','42000000','43000000']);
const SECURITY=Object.freeze(['foreign-partial','cancelled-partial-result','tampered-payload','tampered-signature','wrong-event-kind','corrupt-signer']);
const sha40=/^[a-f0-9]{40}$/;
const sha64=/^[a-f0-9]{64}$/;
const id=(...parts)=>parts.join(':');
const indexUnique=(items,select)=>{
  assert.ok(Array.isArray(items),'missing native evidence rows');
  const map=new Map();
  for(const row of items){
    const k=select(row);
    assert.ok(!map.has(k),'duplicate evidence row '+k);
    map.set(k,row);
  }
  return map;
};
export function qualifyPhysicalSurfaces({registry,coreMatrix,lifecycle,source,context,packageDigest,runtimeQuic}){
  assert.ok(sha40.test(context?.sourceSha)&&sha40.test(context?.sourceTree),'exact source SHA/tree required');
  assert.ok(Number.isSafeInteger(context.runId)&&context.runId>0);
  assert.ok(Number.isSafeInteger(context.runAttempt)&&context.runAttempt>0);
  assert.ok(['pull_request','push','workflow_dispatch'].includes(context.event));
  assert.equal(registry?.schema,'truyn.registry.core/1');
  assert.equal(coreMatrix?.schema,'truyn.core-registry.five-sdk-coverage/v1');
  assert.equal(coreMatrix.stableSdkReleaseAuthorized,false);
  assert.deepEqual(coreMatrix.languages,LANGUAGES);
  assert.equal(coreMatrix.entries.length,registry.entries.length);
  const actual=registry.entries.filter(r=>r.admission==='existing_distinct_wire');
  assert.deepEqual(actual.map(r=>r.code),ACTIVE_CODES,'exact 11 physical surface registry contract');
  for(const entry of actual){
    const projected=coreMatrix.entries.find(r=>r.code===entry.code);
    assert.equal(projected?.semanticObject,entry.name,'wrong semantic projection');
    assert.equal(projected?.semanticForm,entry.form,'wrong physical classification');
    assert.equal(projected?.admission,entry.admission);
    assert.deepEqual(Object.keys(projected.sdkApi).sort(),[...LANGUAGES].sort());
    assert.ok(entry.form==='compact_runtime'||entry.form==='quic_control_method');
  }
  assert.equal(lifecycle?.schema,'truyn.five-sdk-lifecycle/v1');
  assert.deepEqual(lifecycle.context,context,'native lifecycle must match exact run');
  assert.equal(lifecycle.stableProtocolDeclared,false);
  assert.equal(lifecycle.productionCutoverAuthorized,false);
  assert.ok(sha64.test(lifecycle.packagesReportSha256));
  assert.equal(lifecycle.packagesReportSha256,packageDigest,'wrong frozen-package receipts');
  assert.equal(source?.schema,'truyn.source-native-lifecycle/v1');
  assert.deepEqual(source.context,context,'source report from different SHA/run');
  assert.equal(source.status,'PASS');
  assert.equal(source.sourceOnly,true);
  assert.equal(source.scenarios,20);
  assert.equal(source.securityScenarios,30);
  assert.deepEqual(source.languages,LANGUAGES);
  assert.equal(source.stableProtocolDeclared,false);
  assert.ok(sha64.test(source.lifecycleSha256));
  const negatives=indexUnique(lifecycle.sourceSecurity,r=>id(r.language,r.scenario));
  assert.equal(negatives.size,30);
  for(const lang of LANGUAGES)for(const scenario of SECURITY){
    const row=negatives.get(id(lang,scenario));
    assert.equal(row?.status,'PASS',lang+' native compact security:'+scenario);
    assert.ok(Number.isSafeInteger(row.assertions)&&row.assertions>=3,lang+' missing executable native assertions');
  }
  const negotiation=indexUnique(lifecycle.negotiation,r=>id(r.language,r.mode));
  assert.equal(negotiation.size,10);
  const capabilities=indexUnique(lifecycle.capabilities,r=>id(r.language,r.mode));
  assert.equal(capabilities.size,10);
  const life=indexUnique(lifecycle.outcomes,r=>id(r.language,r.provider,r.requester,r.scenario));
  for(const lang of LANGUAGES){
    assert.equal(negotiation.get(id(lang,'candidate'))?.status,'PASS',lang+' negotiation');
    const actor=capabilities.get(id(lang,'candidate'));
    assert.equal(actor?.partial,true,lang+' must use real native compact sender and verifier');
    for(const mode of MODES)for(const other of MODES){
      assert.ok(life.has(id(lang,mode,other,'partial-order-backpressure')),'missing actual cross-version result');
    }
    const direct=life.get(id(lang,'candidate','candidate','partial-order-backpressure'));
    assert.equal(direct.status,'PASS',lang+' actual native signed compact lifecycle');
    assert.ok(Number.isSafeInteger(direct.assertions)&&direct.assertions>=10,'native assertions omitted');
  }
  assert.equal(runtimeQuic?.status,'BOUNDED_NODE_RUNTIME_PASS','QUIC runtime proof must really execute');
  assert.ok(sha64.test(runtimeQuic.logSha256));
  assert.ok(Number.isSafeInteger(runtimeQuic.testsPassed)&&runtimeQuic.testsPassed>0);
  assert.equal(runtimeQuic.testsFailed,0);
  const cells=[];
  for(const entry of actual)for(const language of LANGUAGES){
    const isCompactDirect=DIRECT_NATIVE.has(entry.code);
    const packagePairs=MODES.flatMap(provider=>MODES.map(requester=>{
      const r=life.get(id(language,provider,requester,'partial-order-backpressure'));
      return {provider,requester,
        status:entry.form==='compact_runtime'&&isCompactDirect?(r.status==='PASS'?'BOUNDED_NATIVE_PASS':'BLOCKED'):'NOT_QUALIFIED',
        ...(entry.form==='compact_runtime'&&isCompactDirect&&r.status!=='PASS'?{reason:r.missing||[r.reason||'unsupported_native_api']}:{})};
    }));
    cells.push({
      code:entry.code,name:entry.name,language,wire:entry.form==='quic_control_method'?'QUIC_CONTROL':'COMPACT_SIGNED',
      status:isCompactDirect?'SOURCE_NATIVE_BOUNDED_PASS':'BLOCKED_SDK_API_OR_EXECUTION',
      transmit:isCompactDirect?'EXECUTED_SOURCE_NATIVE':'NOT_PROVEN',
      verify:isCompactDirect?'EXECUTED_SOURCE_NATIVE_CRYPTO':'NOT_PROVEN',
      execute:isCompactDirect?'EXECUTED_LOCAL_LIFECYCLE':'NOT_PROVEN',
      negatives:isCompactDirect?SECURITY.slice() : [],
      sourcePeerEvidence:isCompactDirect?'partial-order-backpressure + 6 native signed negatives':null,
      runtimeOnly:entry.form==='quic_control_method'?'BOUNDED_NODE_QUIC_RUNTIME_NOT_FIVE_SDK':null,
      publishedVsSource:packagePairs
    });
  }
  assert.equal(cells.length,55);
  assert.equal(cells.filter(r=>r.status==='SOURCE_NATIVE_BOUNDED_PASS').length,15);
  assert.equal(cells.filter(r=>r.status==='BLOCKED_SDK_API_OR_EXECUTION').length,40);
  return {
    schema:'truyn.core.physical-five-sdk-qualification/v1',context,
    status:'INVENTORY_COMPLETE_STABLE_BLOCKED',
    totalPhysicalSurfaces:11,nativeSdkCells:55,sourceNativeBoundedPassed:15,blockedSdkCells:40,
    sourceNativeSignedCompact:{codes:[...DIRECT_NATIVE],negativeCasesPerLanguage:SECURITY.length,
      note:'bounded local relay compact lifecycle, not whole network/transport or stable release'},
    quicRuntime:runtimeQuic,
    cells,
    missingReleaseGates:[
      'five-SDK QUIC/DHT physical transport APIs for PING FIND_NODE ANNOUNCE STORE FIND_VALUE',
      'five-SDK signed compact CHAIN CONTEXT_PUT CONTEXT_DELTA APIs and full native negative conformance',
      'full provider-side exactly-once and P6-P9/G5 distributed crash/replica release evidence',
      'P13-FORMAT newly published immutable five-SDK versions and complete old-new format compatibility',
      'independent post-merge exact-SHA final full release admission'
    ],
    stableSdkReleaseAuthorized:false,stableProtocolDeclared:false,productionCutoverAuthorized:false
  };
}
