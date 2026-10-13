import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
export const LANGUAGES = Object.freeze(['typescript', 'python', 'go', 'java', 'dotnet']);
export const MODES = Object.freeze(['legacy', 'candidate']);
export const fixtureUrl = new URL('../v1/p11-registration-confirmation-fixtures.json', import.meta.url);
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function fixture() {
  const bytes = readFileSync(fixtureUrl), value = JSON.parse(bytes);
  assert.equal(value.schema, 'truyn.p11.registration-confirmation/v1');
  assert.equal(value.cases.length, 28);
  assert.equal(new Set(value.cases.map(c => c.id)).size, 28);
  return { ...value, sha256: digest(bytes) };
}
export function validateRegistration(report, context, packageBytes, { requireAll = false } = {}) {
  const cases = fixture();
  assert.equal(report.schema, 'truyn.p11.native-registration/v1');
  assert.deepEqual(report.context, context);
  assert.equal(report.fixtureSha256, cases.sha256);
  assert.equal(report.packagesReportSha256, digest(packageBytes));
  assert.equal(report.stableProtocolDeclared, false);
  assert.equal(report.productionCutoverAuthorized, false);
  const expected = new Set(LANGUAGES.flatMap(l => MODES.flatMap(m => cases.cases.map(c => `${l}/${m}/${c.id}`))));
  assert.equal(report.outcomes?.length, expected.size);
  const seen = new Set();
  for (const row of report.outcomes) {
    const key = `${row.language}/${row.mode}/${row.id}`;
    assert.ok(expected.has(key) && !seen.has(key), 'missing/duplicate registration case'); seen.add(key);
    assert.equal(row.requests, 1, 'one real native registration request required');
    assert.equal(row.signatureVerified, true);
    const item = cases.cases.find(c => c.id === row.id);
    assert.equal(typeof row.accepted, 'boolean');
    const matches = row.accepted === item.expected.ok && (row.accepted || row.code === item.expected.code);
    assert.equal(row.status, matches ? 'PASS' : 'FAIL');
    if (requireAll || row.mode === 'candidate') assert.ok(matches, `registration failed: ${key}`);
  }
  const failed = report.outcomes.filter(r => r.status !== 'PASS');
  assert.equal(report.status, failed.length ? 'HISTORICAL_FAILURES' : 'PASS');
  return { sourceCases: 140, totalCases: 280, historicalFailures: failed.length, sourceStatus: 'PASS' };
}
