import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAgentDescriptor } from '../sdk/conformance/reference/agent-descriptor.js';
const fixture = JSON.parse(readFileSync(new URL('../sdk/conformance/v1/agent-descriptor-runtime-fixtures.json', import.meta.url), 'utf8')).descriptorRuntimeCases.find(item => item.id === 'descriptor.signature-valid');
const evidence = readFileSync(new URL('../docs/compatibility/AGENT_DESCRIPTOR_CURRENT_EVIDENCE.md', import.meta.url), 'utf8');
// Parser scope only: mutated fixtures are not claimed to retain valid signatures.
test('documentation preserves existing reference optional endpoint semantics', () => {
  const absent = structuredClone(fixture.value);
  delete absent.interfaces[0].endpoint;
  assert.equal(parseAgentDescriptor(absent, { now: fixture.now }).ok, true);
  assert.match(evidence, /omitted optional endpoint acceptance/i);
  assert.match(evidence, /reference parser only/i);
  for (const [field, value] of [['endpoint', ''], ['type', ''], ['type', undefined]]) {
    const invalid = structuredClone(fixture.value);
    if (value === undefined) delete invalid.interfaces[0][field];
    else invalid.interfaces[0][field] = value;
    const parsed = parseAgentDescriptor(invalid, { now: fixture.now });
    assert.equal(parsed.ok, false, field);
    assert.equal(parsed.reason, 'invalid_descriptor_interfaces', field);
  }
});
