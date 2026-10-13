import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const registry = JSON.parse(readFileSync('spec/registry/truyn-core-v1.json', 'utf8'));
const resolution = JSON.parse(readFileSync('spec/registry/truyn1-source-short-reconciliation.json', 'utf8'));

test('approved source Short differences preserve the immutable CORE registry without wire aliases', () => {
  assert.equal(resolution.status, 'CLASS_C_PROPOSAL_NOT_WIRE_ADMISSION');
  assert.equal(registry.entries.length, 80);
  assert.equal(resolution.changedEntries.length, 41);
  const codes = new Set();
  const historicalLabels = new Set();
  const canonical = new Set(registry.entries.map(e => e.short).filter(Boolean));
  for (const row of resolution.changedEntries) {
    assert.match(row.code, /^[0-9]{8}$/);
    assert.equal(row.mode, 'PROVENANCE_ONLY_NOT_WIRE');
    assert.ok(!codes.has(row.code)); codes.add(row.code);
    const entry = registry.entries.find(e => e.code === row.code);
    assert.ok(entry, 'missing frozen code');
    assert.equal(row.name, entry.name);
    assert.equal(row.canonicalRegistryShort, entry.short);
    assert.notEqual(row.sourceDocumentShort, entry.short);
    assert.match(row.sourceDocumentShort, /^[A-I][0-9]{2,3}$/);
    assert.ok(!historicalLabels.has(row.sourceDocumentShort)); historicalLabels.add(row.sourceDocumentShort);
    assert.ok(!canonical.has(row.sourceDocumentShort), 'historical label collides with active machine Short');
  }
  assert.deepEqual(registry.baseline_signed_envelope_types, ['IDENTITY','OFFER','NEED','RESULT','REVOKE']);
  assert.equal(registry.policy.extension_default_off, true);
});
