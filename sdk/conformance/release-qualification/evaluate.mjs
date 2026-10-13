import assert from 'node:assert/strict';
const sha40=s=>/^[a-f0-9]{40}$/.test(s||'');
const sha64=s=>/^[a-f0-9]{64}$/.test(s||'');
export const LANGUAGES=['typescript','python','go','java','dotnet'];
const MODES=['legacy','candidate'];
export function qualify({context,freeze,matrix,source,coverage,suites,receipts}){
  assert.ok(sha40(context?.sourceSha)&&sha40(context?.sourceTree),'missing_exact_source_or_tree');
  assert.ok(Number.isSafeInteger(context.runId)&&context.runId>0);
  assert.ok(Number.isSafeInteger(context.runAttempt)&&context.runAttempt>0);
  assert.ok(['push','pull_request','workflow_dispatch'].includes(context.event));
  assert.equal(freeze?.schema,'truyn.protocol1.five-sdk-freeze/v1');
  assert.equal(freeze.releaseChannel,'PUBLIC_PRERELEASE_ONLY');
  assert.equal(freeze.stableProtocolDeclared,false);
  assert.ok(sha40(freeze.frozenSourceSha));
  assert.equal(matrix?.schema,'truyn.five-sdk-exact-interop-evidence/v1');
  assert.equal(matrix.status,'PASS');
  assert.equal(matrix.stableProtocolDeclared,false);
  assert.equal(matrix.productionCutoverAuthorized,false);
  assert.deepEqual(matrix.context,context);
  assert.equal(matrix.publishedSdkSourceSha,freeze.frozenSourceSha);
  assert.ok(sha64(matrix.pinsSha256)&&sha64(matrix.matrixLogSha256));
  assert.equal(matrix.caseCount,20);
  const want=new Set(LANGUAGES.flatMap(l=>MODES.flatMap(p=>MODES.map(r=>[l,p,r].join(':')))));
  const got=new Set();
  assert.equal(matrix.outcomes?.length,20);
  for(const row of matrix.outcomes){
    const key=[row.language,row.provider,row.requester].join(':');
    assert.ok(want.has(key)&&!got.has(key),'invalid_matrix_cell:'+key);
    assert.equal(row.status,'PASS',key);got.add(key);
  }
  assert.equal(got.size,20);
  assert.equal(matrix.packages?.length,5);
  assert.equal(freeze.coordinates?.length,5);
  for(const language of LANGUAGES){
    const pin=freeze.coordinates.filter(x=>x.id===language);
    const pkg=matrix.packages.filter(x=>x.id===language);
    assert.equal(pin.length,1);assert.equal(pkg.length,1);
    assert.equal(pkg[0].coordinate,pin[0].coordinate);
    assert.equal(pkg[0].status,'PASS');
    assert.ok(sha64(pkg[0].archiveSha256));
    assert.equal(pkg[0].pinsSha256,matrix.pinsSha256);
    assert.deepEqual(pkg[0].context,context);
  }
  assert.equal(source?.schema,'truyn.source-native-lifecycle/v1');
  assert.deepEqual(source.context,context);
  assert.equal(source.status,'PASS');
  assert.equal(source.sourceOnly,true);
  assert.equal(source.scenarios,20);
  assert.equal(source.securityScenarios,30);
  assert.deepEqual(source.languages,LANGUAGES);
  assert.ok(sha64(source.lifecycleSha256));
  assert.equal(source.stableProtocolDeclared,false);
  assert.equal(coverage?.schema,'truyn.p14.lifecycle-coverage/v1');
  assert.equal(coverage.sourceSha,context.sourceSha);
  assert.ok(['BLOCKED','PASS'].includes(coverage.status));
  assert.equal(coverage.expectedCases,540);
  assert.equal(coverage.observedCases,540);
  assert.equal(coverage.passed+coverage.blockers.length,540);
  assert.equal(coverage.stableProtocolDeclared,false);
  assert.equal(coverage.productionCutoverAuthorized,false);
  for(const name of ['P11','P12','P13-FORMAT']){
    assert.ok(Number.isSafeInteger(suites[name]?.passed)&&suites[name].passed>0);
    assert.equal(suites[name].failed,0);
    assert.ok(sha64(suites[name].logSha256));
  }
  for(const name of ['report.json','lifecycle.json','source-lifecycle.json','p14-lifecycle-coverage.json'])
    assert.ok(sha64(receipts[name]),'missing_evidence_sha256:'+name);
  return {
    schema:'truyn.p11-p12-p13format.exact-qualification/v1',exact:context,
    priorSdkSourceSha:freeze.frozenSourceSha,priorSdkCoordinates:freeze.coordinates,
    receiptsSha256:receipts,suites,
    p11:{status:'BOUNDED_SOURCE_PASS',matrix:'RC1',realSecondGenerationCertified:false},
    p12:{status:'BOUNDED_REFERENCE_PROFILE_PASS',distributedObjectTransportCertified:false},
    p13Format:{status:'PRE_STABLE',realPublishedSourcePairs:got.size,
      nativeSourceLifecycle:source.scenarios,nativeSourceSecurity:source.securityScenarios,
      immutablePublishedLifecycleCoverage:coverage.status,
      publishedLifecycleMissingOrUnsupported:coverage.blockers.length,
      stablePublishedSdkVersions:0,missing:[
        'five_immutable_published_stable_sdk_versions',
        'cross_version_five_sdk_positive_and_negative_format_matrix',
        'canonical_signed_wire_final_release_freeze',
        'exact_stable_release_source_and_package_proofs',
        'post_merge_stable_release_reconciliation'
      ]},
    stableProtocolDeclared:false,productionCutoverAuthorized:false
  };
}