import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { negotiateProtocol } from '../core/protocol/negotiation.js';

const fixtures = JSON.parse(
  readFileSync(new URL('../sdk/conformance/v1/protocol-negotiation-negative-fixtures.json', import.meta.url), 'utf8')
);

test('Open 1.0 RC durable negotiation mismatch vectors fail with their declared compatibility errors', () => {
  assert.equal(fixtures.schemaVersion, 1);
  for (const fixture of fixtures.cases) {
    assert.deepEqual(negotiateProtocol(fixture.input), fixture.expected, fixture.id);
  }
});
