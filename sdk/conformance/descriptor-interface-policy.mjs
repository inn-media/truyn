import assert from 'node:assert/strict';

// Reviewed bounded test contract, independent of the editable input fixture.
// A legitimate matrix extension must update this policy and its regressions.
const endpoint = 'https://example.test/truyn';
const acceptedCases = [
  { id: 'endpoint-omitted', interfaces: [{ type: 'https' }], ok: true },
  { id: 'endpoint-present', interfaces: [{ type: 'https', endpoint }], ok: true },
  { id: 'endpoint-empty', interfaces: [{ type: 'https', endpoint: '' }], ok: false },
  { id: 'type-omitted', interfaces: [{ endpoint }], ok: false },
  { id: 'type-empty', interfaces: [{ type: '', endpoint }], ok: false },
  { id: 'endpoint-null', interfaces: [{ type: 'https', endpoint: null }], ok: false },
  { id: 'endpoint-number', interfaces: [{ type: 'https', endpoint: 7 }], ok: false },
  { id: 'type-null', interfaces: [{ type: null }], ok: false },
  { id: 'type-number', interfaces: [{ type: 7 }], ok: false },
  { id: 'entry-null', interfaces: [null], ok: false },
  { id: 'entry-string', interfaces: ['https'], ok: false },
  { id: 'valid-then-empty-endpoint', interfaces: [{ type: 'https' }, { type: 'mcp', endpoint: '' }], ok: false },
  { id: 'valid-then-missing-type', interfaces: [{ type: 'https' }, {}], ok: false },
  { id: 'empty-endpoint-then-valid', interfaces: [{ type: 'mcp', endpoint: '' }, { type: 'https' }], ok: false },
  { id: 'optional-endpoint-with-metadata', interfaces: [{ type: 'https', version: '1', contentTypes: ['application/json'] }], ok: true },
  { id: 'endpoint-whitespace-reference-profile', interfaces: [{ type: 'https', endpoint: ' ' }], ok: true },
  { id: 'omitted-endpoint-tampered-signature', interfaces: [{ type: 'https' }], ok: false, tamperSignature: true },
  { id: 'present-endpoint-tampered-signature', interfaces: [{ type: 'https', endpoint }], ok: false, tamperSignature: true },
  { id: 'type-whitespace-reference-profile', interfaces: [{ type: ' ' }], ok: true }
];
const requiredIds = acceptedCases.map(item => item.id).sort();
export function validateDescriptorInterfaceCases(cases) {
  assert.ok(Array.isArray(cases), 'Descriptor interface cases must be an array');
  assert.equal(cases.length, acceptedCases.length, 'exactly 19 reviewed Descriptor interface cases required');
  assert.deepEqual(cases.map(item => item?.id).sort(), requiredIds, 'exact distinct Descriptor case IDs required');
  for (const expected of acceptedCases) {
    assert.deepEqual(cases.find(item => item?.id === expected.id), expected,
      `${expected.id}: input shape, outcome and signature control must match the reviewed contract`);
  }
  return cases;
}
export function validateDescriptorInterfaceFixture(fixture) {
  assert.equal(fixture?.schema, 'truyn.descriptor-interface-fixtures/v1', 'unsupported Descriptor fixture schema');
  return validateDescriptorInterfaceCases(fixture.cases);
}
