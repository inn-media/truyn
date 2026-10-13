import assert from 'node:assert/strict';
import { LANGUAGES, MODES, digest } from './contract.mjs';
export function validateArtifactMatrix(report, context, packageBytes) {
  assert.equal(report?.schema,'truyn.p12.native-artifact-reference/v1');
  assert.deepEqual(report.context,context);
  assert.equal(report.packagesReportSha256,digest(packageBytes));
  assert.equal(report.status,'PASS'); assert.equal(report.implicitFetches,0);
  assert.equal(report.stableProtocolDeclared,false); assert.equal(report.productionCutoverAuthorized,false);
  const expected=new Set(LANGUAGES.flatMap(l=>MODES.flatMap(p=>MODES.map(r=>`${l}/${p}/${r}`))));
  assert.equal(report.outcomes?.length,expected.size); const seen=new Set();
  for(const row of report.outcomes){
    const key=`${row.language}/${row.provider}/${row.requester}`;
    assert.ok(expected.has(key)&&!seen.has(key));seen.add(key);
    assert.equal(row.status,'PASS');
    for(const field of ['signatureVerified','referencePreserved','explicitResolverVerified','wrongDigestRejected','wrongSizeRejected','noResolverRejected'])assert.equal(row[field],true);
    assert.equal(row.resolverCalls,1);
  }
  return {cases:expected.size,status:'PASS'};
}
