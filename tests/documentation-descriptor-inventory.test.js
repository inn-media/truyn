import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const canonical = read('docs/compatibility/AGENT_DESCRIPTOR_CURRENT_EVIDENCE.md');
const cases = JSON.parse(read('sdk/conformance/v1/agent-descriptor-runtime-fixtures.json')).descriptorRuntimeCases;
const documentedIds = source => [...source.matchAll(/^- `(descriptor\.[^`\r\n]+)`[ \t]*$/gm)].map(match => match[1]);

function assertSameCaseInventory(actualCases, documentation) {
  assert.ok(Array.isArray(actualCases) && actualCases.length > 0, 'nonempty fixture case inventory');
  const actual = actualCases.map(item => item?.id);
  const documented = documentedIds(documentation);
  assert.ok(actual.every(id => typeof id === 'string' && id.startsWith('descriptor.')), 'valid fixture identities');
  assert.ok(documented.length > 0, 'nonempty documented case inventory');
  assert.equal(new Set(actual).size, actual.length, 'duplicate fixture identities');
  assert.equal(new Set(documented).size, documented.length, 'duplicate documented identities');
  assert.deepEqual([...documented].sort(), [...actual].sort(), 'documented and current fixture identities must match in both directions');
}

test('Descriptor evidence names exactly the current distinct runtime fixture cases', () => {
  assertSameCaseInventory(cases, canonical);
  assertSameCaseInventory([...cases].reverse(), canonical); // Ordering is not semantic.
});

test('one-sided case removal, addition, renaming or duplication fails documentation conformance', () => {
  for (const [index, item] of cases.entries()) {
    assert.throws(() => assertSameCaseInventory(cases.filter((_, i) => i !== index), canonical), `removed fixture ${item.id}`);
    const withoutDocumentedCase = canonical.split('\n').filter(line => line.trim() !== '- `' + item.id + '`').join('\n');
    assert.throws(() => assertSameCaseInventory(cases, withoutDocumentedCase), `removed documented ${item.id}`);
  }
  const extra = { id: 'descriptor.undocumented-extra-case' };
  assert.throws(() => assertSameCaseInventory([...cases, extra], canonical));
  assert.throws(() => assertSameCaseInventory(cases, canonical + '\n- `' + extra.id + '`\n'));
  assert.throws(() => assertSameCaseInventory([...cases, cases[0]], canonical));
  assert.throws(() => assertSameCaseInventory(cases, canonical + '\n- `' + cases[0].id + '`\n'));
  assert.throws(() => assertSameCaseInventory([{ ...cases[0], id: 'descriptor.renamed-case' }, ...cases.slice(1)], canonical));
  assert.throws(() => assertSameCaseInventory(cases, canonical.replace('- `' + cases[0].id + '`', '- `descriptor.renamed-case`')));
  assert.throws(() => assertSameCaseInventory([], canonical));
  assert.throws(() => assertSameCaseInventory(cases, '# No observed case list\n'));
});
