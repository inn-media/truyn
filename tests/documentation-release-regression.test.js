import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { auditDocumentation, validateReleaseInventory } from '../scripts/check-documentation-consistency.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const json = p => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));

test('current five SDK coordinates, P1-P14 evidence inventory and documentation links agree', () => {
  const audit = auditDocumentation(root);
  assert.deepEqual(audit.errors, []);
  assert.equal(audit.networkAccess, false);
  assert.equal(audit.stableAdmission, false);
  assert.ok(audit.markdownFiles >= 328);
});
test('stale versions and false stable promotion fail the release documentation guard', () => {
  const current = json('sdk/release/public-coordinates.json');
  const freeze = json('spec/compatibility/truyn1-five-sdk-freeze.json');
  const versions = json('sdk/release/version.json');
  assert.deepEqual(validateReleaseInventory(current, freeze, versions), []);
  for (const id of ['npm', 'pypi', 'go', 'maven', 'nuget']) {
    const mutated = structuredClone(current);
    mutated.coordinates[id].coordinate += '-obsolete';
    assert.ok(validateReleaseInventory(mutated, freeze, versions).some(x => x.startsWith('stale coordinate')));
  }
  assert.ok(validateReleaseInventory(current, { ...freeze, stableProtocolDeclared: true }, versions).length > 0);
});
test('historical Developer Release ledger is preserved byte-exact, not rewritten to newer package evidence', () => {
  const history = readFileSync(new URL('../sdk/release/evidence/public-coordinates-developer-release-2026-09-23.json', import.meta.url));
  assert.equal(createHash('sha256').update(history).digest('hex'), '0f88bbf993163defe53e5c07eb57f17d64decfda8e8db2f7d006a1c750a3b0f0');
});
