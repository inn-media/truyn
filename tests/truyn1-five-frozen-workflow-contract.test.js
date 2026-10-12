import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const f=JSON.parse(read('spec/compatibility/truyn1-five-sdk-freeze.json'));
const y=read('.github/workflows/truyn1-five-published-freeze-interop.yml');
const legacy=read('.github/workflows/wire-freeze-legacy-sdk-matrix.yml');
const cs=read('sdk/conformance/legacy-peer/dotnet/legacy/LegacyPeer.csproj');
test('frozen wire SDK workflow installs five exact independent public versions and reuses 20 actual peer cases',()=>{
 assert.equal(f.coordinates.length,5);
 for(const id of ['typescript','python','go','java','dotnet'])
   assert.equal(f.coordinates.filter(c=>c.id===id).length,1);
 for(const text of ['@truyn/sdk@0.1.0-alpha.5','truyn-sdk==0.1.0a2',
 'github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.2','org.truyn:truyn-sdk:0.1.0-alpha.2',
 '-p:TruynInteropPackageVersion=0.1.0-alpha.2','node sdk/conformance/legacy-peer/run-matrix.mjs',
 'truyn1-five-frozen-sdk-interop-'])
  assert.ok(y.includes(text),'expected exact frozen workflow step '+text);
 assert.match(cs,/TruynInteropPackageVersion/);
 assert.match(cs,/0\.1\.0-alpha\.1/); // old immutable Developer Release runner remains compatible
 assert.match(legacy,/@truyn\/sdk@0\.1\.0-alpha\.2/);
 assert.match(legacy,/truyn-sdk==0\.1\.0a1/);
 assert.match(legacy,/sdk\/go@v0\.1\.0-alpha\.1/);
 assert.match(legacy,/org\.truyn:truyn-sdk:0\.1\.0-alpha\.1/);
});
test('frozen interop is a non-admitting prerelease proof; stable protocols cannot be minted by workflow assertion',()=>{
 assert.equal(f.releaseChannel,'PUBLIC_PRERELEASE_ONLY');
 assert.equal(f.stableProtocolDeclared,false);
 assert.match(y,/Verify exact frozen SDK pins and non-admitting source contract/);
 assert.match(y,/permissions:\s*contents: read/);
 assert.doesNotMatch(y,/(?:^|\n)\s*(?:npm\s+publish|twine\s+upload|dotnet\s+nuget\s+push|mvn\s+deploy)\b/im);
 const code=read('sdk/conformance/legacy-peer/run-matrix.mjs');
 assert.match(code,/\['legacy','legacy'\],\['legacy','candidate'\]/);
 assert.match(code,/\['candidate','legacy'\],\['candidate','candidate'\]/);
});
