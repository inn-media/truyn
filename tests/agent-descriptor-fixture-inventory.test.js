import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDescriptorInterfaceCases, validateDescriptorInterfaceFixture } from '../sdk/conformance/descriptor-interface-policy.mjs';
import { validateResults, loadCases, languages } from '../sdk/conformance/run-descriptor-interface-parity.mjs';
const fixture = JSON.parse(readFileSync(new URL('../sdk/conformance/v1/agent-descriptor-interface-fixtures.json', import.meta.url), 'utf8'));

test('the native runner requires the complete reviewed fixture contract before execution and reporting', () => {
  assert.deepEqual(loadCases(), fixture.cases);
  assert.doesNotThrow(() => validateDescriptorInterfaceFixture(fixture));
  assert.doesNotThrow(() => validateDescriptorInterfaceCases([...fixture.cases].reverse()));
  for (const cases of [[], null, {}, fixture.cases.slice(1), [...fixture.cases, fixture.cases[0]]]) {
    assert.throws(() => validateDescriptorInterfaceCases(cases));
    assert.throws(() => validateDescriptorInterfaceFixture({ ...fixture, cases }));
  }
  const emptyResults = Object.fromEntries(languages.map(language => [language, []]));
  assert.throws(() => validateResults([], emptyResults, {}, 'unused'), /19 reviewed/);
  for (const schema of [undefined, null, '', 'truyn.descriptor-interface-fixtures/v2']) {
    assert.throws(() => validateDescriptorInterfaceFixture({ ...fixture, schema }), /schema/);
  }
  for (let i = 0; i < fixture.cases.length; i++) {
    const mutations = [
      cases => cases.splice(i, 1),
      cases => { cases[i] = structuredClone(cases[(i + 1) % cases.length]); },
      cases => { cases[i].id += '-renamed'; },
      cases => { cases[i].ok = !cases[i].ok; },
      cases => { cases[i].interfaces = []; },
      cases => { cases[i].tamperSignature = !cases[i].tamperSignature; }
    ];
    for (const mutate of mutations) {
      const cases = structuredClone(fixture.cases); mutate(cases);
      assert.throws(() => validateDescriptorInterfaceCases(cases), fixture.cases[i].id);
      assert.throws(() => validateDescriptorInterfaceFixture({ ...fixture, cases }), fixture.cases[i].id);
      assert.throws(() => validateResults(cases, emptyResults, {}, 'unused'), fixture.cases[i].id);
    }
  }
});
