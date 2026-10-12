import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { negotiateProtocol } from '../core/protocol/negotiation.js';

const matrix = JSON.parse(readFileSync(new URL('../spec/compatibility/p11-negotiation-matrix.json', import.meta.url), 'utf8'));
const negative = JSON.parse(readFileSync(new URL('../sdk/conformance/v1/protocol-negotiation-negative-fixtures.json', import.meta.url), 'utf8'));

test('P11 frozen compatibility decision matrix has a truthful pre-stable scope and complete executable cases', () => {
  assert.equal(matrix.schemaVersion, 1);
  assert.equal(matrix.matrixId, 'truyn-p11-required-semantic-negotiation/rc1');
  assert.equal(matrix.status, 'frozen-release-candidate-contract');
  assert.equal(matrix.stableProtocolDeclared, false);
  assert.equal(matrix.normative, 'spec/protocol/v1/core.md#compatibility-and-negotiation');
  assert.equal(matrix.implementation, 'core/protocol/negotiation.js');
  assert.equal(matrix.cases.length, 10);
  const ids = new Set();
  const dispositions = new Set();
  for (const row of matrix.cases) {
    assert.ok(!ids.has(row.id), 'duplicate compatibility row: ' + row.id);
    ids.add(row.id);
    dispositions.add(row.disposition);
    assert.deepEqual(negotiateProtocol(row.input), row.expected, row.id);
    assert.equal(row.disposition === 'reject', row.expected.ok === false, row.id);
    if (!row.expected.ok) {
      assert.equal(row.expected.code, 'version_mismatch', row.id);
      assert.ok(['no_protocol_overlap', 'required_semantic_unavailable'].includes(row.expected.reason), row.id);
    } else {
      assert.ok(/^TRUYN\\/\\d+$/.test(row.expected.protocol), row.id);
      assert.deepEqual(row.expected.semantics, [...row.expected.semantics].sort(), row.id);
    }
  }
  assert.deepEqual([...dispositions].sort(), ['compatible', 'fallback', 'reject']);
});

test('P11 existing shared negative vectors are preserved exactly by the frozen matrix', () => {
  assert.equal(negative.schemaVersion, 1);
  assert.equal(negative.cases.length, 2);
  for (const fixture of negative.cases) {
    const row = matrix.cases.find((item) => item.id === fixture.id);
    assert.ok(row, fixture.id);
    assert.equal(row.disposition, 'reject');
    assert.deepEqual(row.input, fixture.input, fixture.id);
    assert.deepEqual(row.expected, fixture.expected, fixture.id);
  }
});

test('P11 matrix explicitly links authenticated boundary negatives and forbids stable release promotion', () => {
  assert.equal(matrix.stableProtocolDeclared, false);
  const evidenceIds = new Set(matrix.boundaryEvidence.map((item) => item.id));
  for (const expectedId of ['relay-registration-no-overlap-and-required', 'signed-peer-hello-and-accept', 'relay-client-registration', 'shared-negative-fixtures']) {
    assert.ok(evidenceIds.has(expectedId), expectedId);
  }
  for (const item of matrix.boundaryEvidence) {
    assert.ok(existsSync(new URL('../' + item.path, import.meta.url)), item.path);
    assert.ok(item.contract.length > 20, item.id);
  }
  assert.ok(matrix.limitations.some((item) => item.includes('synthetic')));
  assert.ok(matrix.limitations.some((item) => item.includes('flat semantic lists')));
});
