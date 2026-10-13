import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyTruynError, TRUYN_ERROR_CODES } from '../core/protocol/normalized-errors.js';

const map = JSON.parse(readFileSync('spec/registry/truyn1-outcome-p10-reconciliation.json','utf8'));
const registry = JSON.parse(readFileSync('spec/registry/truyn-core-v1.json','utf8'));
const fixtures = JSON.parse(readFileSync('sdk/conformance/v1/p10-error-mapping.json','utf8'));

test('P10 public set stays exactly thirteen existing codes and source proposals are not new codes', () => {
  const expected = ['version_mismatch','unauthenticated','permission_denied','deadline_exceeded',
    'invalid_argument','unimplemented','cancelled','transport_error','invalid_response',
    'not_found','conflict','resource_exhausted','internal_error'];
  assert.deepEqual(TRUYN_ERROR_CODES, expected);
  assert.equal(map.stableCodeCount,13);
  assert.equal(map.translations.length,3);
  for (const translation of map.translations) {
    const entry = registry.entries.find(x => x.code === translation.registryCode);
    assert.ok(entry);
    assert.equal(entry.name, translation.registrySemantic);
    assert.equal(translation.newPublicCode,false);
    assert.ok(!TRUYN_ERROR_CODES.includes(translation.registrySemantic));
    if (translation.existingPublicClass) assert.ok(TRUYN_ERROR_CODES.includes(translation.existingPublicClass));
  }
  assert.equal(fixtures.cases.length,20);
});
test('existing deterministic P10 classifier remains conservative for duplicate, internal, unavailable and replay', () => {
  for (const [input,expected] of [
    [{sourceCode:'duplicate_request',status:409},{code:'conflict',retryable:false}],
    [{sourceCode:'already_exists',status:409},{code:'conflict',retryable:false}],
    [{sourceCode:'internal',status:500},{code:'internal_error',retryable:false}],
    [{sourceCode:'unavailable',status:503},{code:'internal_error',retryable:false}],
    [{sourceCode:'',status:503,clientKind:'transport'},{code:'transport_error',retryable:true}],
    [{sourceCode:'offer_capacity_reached',status:503},{code:'resource_exhausted',retryable:true}],
    [{sourceCode:'',status:429},{code:'resource_exhausted',retryable:false}]
  ]) assert.deepEqual(classifyTruynError(input),expected);
});
