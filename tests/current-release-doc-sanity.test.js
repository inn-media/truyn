import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const coords = JSON.parse(read('sdk/release/public-coordinates.json'));
const release = read('docs/releases/WIRE_FREEZE_FIVE_SDK_REGISTRY_2026-10-11.md');
const current = {
  npm: {version:'0.1.0-alpha.5', coordinate:'@truyn/sdk@0.1.0-alpha.5'},
  pypi:{version:'0.1.0a2',coordinate:'truyn-sdk==0.1.0a2'},
  go:{version:'v0.1.0-alpha.2',coordinate:'github.com/inn-media/truyn/sdk/go@v0.1.0-alpha.2'},
  maven:{version:'0.1.0-alpha.2',coordinate:'org.truyn:truyn-sdk:0.1.0-alpha.2'},
  nuget:{version:'0.1.0-alpha.2',coordinate:'Truyn.Sdk@0.1.0-alpha.2'}
};

test('current public coordinates agree with frozen registry evidence rather than old developer alpha', () => {
  assert.equal(coords.channel, 'public-pre-release');
  assert.equal(coords.frozenReleaseSourceSha, '57971b134a41c3e3ea4b42f68e86a7d117036006');
  for (const [id, expected] of Object.entries(current)) {
    assert.equal(coords.coordinates[id].version, expected.version, id + ' version');
    assert.equal(coords.coordinates[id].coordinate, expected.coordinate, id + ' coordinate');
    assert.ok(release.includes(expected.coordinate.replace('Truyn.Sdk@','Truyn.Sdk ')), id + ' immutable evidence');
    assert.equal(coords.coordinates[id].publicationState,'accepted');
  }
  assert.match(coords.statusBoundary, /pre-stable|not stable/i);
});

test('active public install documents cite the accepted prerelease and never imply stable SDK 1.0.0', () => {
  for (const p of ['sdk/README.md','docs/compatibility/SDK_COMPATIBILITY.md','docs/compatibility/SDK_PACKAGING.md','spec/compatibility/matrix.md','ROADMAP.md']) {
    const s=read(p);
    assert.ok(s.includes(current.npm.coordinate), p+' npm current');
    assert.ok(s.includes(current.pypi.coordinate), p+' PyPI current');
    assert.match(s, /not stable|pre-stable|not yet|pre-release|prerelease/i, p+' boundary');
  }
  const pub=read('sdk/release/PUBLISHING.md');
  assert.ok(pub.includes('0.1.0-alpha.5') && pub.includes('0.1.0a2'));
  assert.ok(pub.includes('0.1.0-alpha.2') && pub.includes('2026-10-11'));
});

test('bounded protocol acceptance is not misrepresented as full stable or Mainnet qualification',()=>{
  const ledger=read('docs/compatibility/TRUYN1_RC_GAP_LEDGER.md');
  assert.match(ledger,/P1.+BOUNDED RC PASS/);
  assert.match(ledger,/P5.+REGISTRATION RC PASS/);
  assert.match(ledger,/P10.+CLOSED/);
  assert.match(ledger,/P11.+RC DECISION MATRIX/);
  assert.match(ledger,/P6.+OPEN/);
  assert.match(ledger,/P13-FORMAT/);
  assert.match(ledger,/P13-OPS/);
  assert.match(ledger,/P14.+Draft/);
});
