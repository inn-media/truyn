import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MVP_TYPES, COMPACT_TYPES, canonicalize } from '../core/protocol/index.js';

const registry = JSON.parse(readFileSync(new URL('../spec/registry/truyn-core-v1.json', import.meta.url), 'utf8'));
const expectedFive = ['IDENTITY','OFFER','NEED','RESULT','REVOKE'];
const expectedCompact = ['NEED','RESULT','PARTIAL','CHAIN','CONTEXT_PUT','CONTEXT_DELTA'];

test('approved extended A-I CORE is complete and registry-only', () => {
  assert.equal(registry.schema, 'truyn.registry.core/1');
  assert.equal(registry.entries.length, 80);
  assert.deepEqual([...new Set(registry.entries.map(x => x.class))].sort(), ['A','B','C','D','E','F','G','H','I','reserved']);
  assert.equal(registry.entries[0].code, '00000000');
  assert.equal(new Set(registry.entries.map(x=>x.code)).size, registry.entries.length);
  for (const row of registry.entries) assert.match(row.code, /^[0-9]{8}$/);
  assert.equal(registry.policy.registry_membership_does_not_imply_wire_support, true);
});

test('CORE expansion never mutates existing physical signed JSON kinds or compact kinds', () => {
  assert.deepEqual(MVP_TYPES, expectedFive);
  assert.deepEqual(registry.baseline_signed_envelope_types, expectedFive);
  assert.deepEqual(COMPACT_TYPES, expectedCompact);
  const baseline = registry.entries.filter(x => x.form === 'signed_envelope_v1').map(x => x.name);
  assert.deepEqual(baseline, expectedFive);
  const aliases = Object.fromEntries(registry.entries.filter(x => x.compact_alias).map(x => [x.name,x.compact_alias]));
  assert.deepEqual(aliases,{C_NEED:'N',C_RESULT:'R',PARTIAL:'T',CHAIN:'C',CONTEXT_PUT:'P',CONTEXT_DELTA:'D'});
  const sessionWelcome = registry.entries.find(x => x.code === '12000000');
  const commitmentAccept = registry.entries.find(x => x.code === '37300000');
  assert.equal(sessionWelcome.name, 'WELCOME');
  assert.equal(commitmentAccept.name, 'ACCEPT');
});

test('legacy canonical JSON signed byte representation retains present optional fields', () => {
  const input = {protocol:'TRUYN/1',type:'NEED',to:null,ext:{priority:'normal'},payload:{z:2,a:1}};
  assert.equal(canonicalize(input), '{"ext":{"priority":"normal"},"payload":{"a":1,"z":2},"protocol":"TRUYN/1","to":null,"type":"NEED"}');
  assert.equal(canonicalize({v:'R&D <b> 🚀'}),'{"v":"R&D <b> 🚀"}');
});
