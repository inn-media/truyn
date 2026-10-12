import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditDocumentation, validateReleaseInventory, validateProtocolInventory, validateEvidencePaths } from '../scripts/check-documentation-consistency.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const json = p => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const release = () => [json('sdk/release/public-coordinates.json'), json('spec/compatibility/truyn1-five-sdk-freeze.json'), json('sdk/release/version.json')];

test('current five SDK coordinates, P1-P14 evidence inventory and documentation links agree', () => {
  const audit = auditDocumentation(root);
  assert.deepEqual(audit.errors, []);
  assert.equal(audit.networkAccess, false);
  assert.equal(audit.stableAdmission, false);
  assert.ok(audit.markdownFiles >= 328);
});
test('stale versions and false stable promotion fail the release documentation guard', () => {
  const [current, freeze, versions] = release();
  assert.deepEqual(validateReleaseInventory(current, freeze, versions), []);
  for (const id of ['npm', 'pypi', 'go', 'maven', 'nuget']) {
    const mutated = structuredClone(current);
    mutated.coordinates[id].coordinate += '-obsolete';
    assert.ok(validateReleaseInventory(mutated, freeze, versions).some(x => x.startsWith('stale coordinate')));
  }
  assert.ok(validateReleaseInventory(current, { ...freeze, stableProtocolDeclared: true }, versions).length > 0);
});
test('five entries cannot hide a duplicated, missing or unknown SDK identity', () => {
  const [current, freeze, versions] = release();
  for (let omitted = 0; omitted < freeze.coordinates.length; omitted++) {
    const mutated = structuredClone(freeze);
    mutated.coordinates[omitted] = structuredClone(mutated.coordinates[(omitted + 1) % 5]);
    assert.ok(validateReleaseInventory(current, mutated, versions).some(x => x.includes('distinct required SDK IDs')));
  }
  const unknown = structuredClone(freeze);
  unknown.coordinates[0].id = 'unknown';
  assert.ok(validateReleaseInventory(current, unknown, versions).length > 0);
  const missing = structuredClone(freeze); missing.coordinates.pop();
  assert.ok(validateReleaseInventory(current, missing, versions).length > 0);
  const wrongKey = structuredClone(current);
  wrongKey.coordinates.unknown = wrongKey.coordinates.nuget; delete wrongKey.coordinates.nuget;
  assert.ok(validateReleaseInventory(wrongKey, freeze, versions).some(x => x.includes('registry keys')));
  assert.ok(validateReleaseInventory(current, { ...freeze, coordinates: null }, versions).length > 0);
});
test('each accepted coordinate requires its own canonical evidence pointer', () => {
  const [current, freeze, versions] = release();
  for (const key of ['npm', 'pypi', 'go', 'maven', 'nuget']) {
    for (const value of [undefined, '', ' ', 'docs/missing-release-proof.md']) {
      const mutated = structuredClone(current);
      if (value === undefined) delete mutated.coordinates[key].evidence;
      else mutated.coordinates[key].evidence = value;
      assert.ok(validateReleaseInventory(mutated, freeze, versions).some(x => x.includes('evidence pointer')));
    }
  }
  const missing = structuredClone(current); delete missing.releaseEvidence;
  assert.ok(validateReleaseInventory(missing, freeze, versions).length > 0);
});
test('accepted evidence must be an existing repository-local file, even when all pointers agree', () => {
  const directory = mkdtempSync(join(tmpdir(), 'truyn-doc-evidence-'));
  try {
    mkdirSync(join(directory, 'docs'));
    writeFileSync(join(directory, 'docs', 'proof.md'), '# Actual proof\n');
    assert.deepEqual(validateEvidencePaths(directory, [{ label: 'npm', path: 'docs/proof.md' }]), []);
    for (const path of [undefined, '', 'docs/missing.md', 'docs', '../outside.md', '/outside.md', 'https://example.org/proof']) {
      assert.ok(validateEvidencePaths(directory, [{ label: 'npm', path }]).length > 0, String(path));
    }
    const [current] = release();
    const entries = Object.keys(current.coordinates).map(label => ({ label, path: 'docs/nonexistent-but-consistent.md' }));
    assert.equal(validateEvidencePaths(directory, entries).length, 5);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('every P1-P14 acceptance state and evidence scope is independently guarded', () => {
  const inventory = json('docs/compatibility/protocol-rc-documentation-inventory.json');
  assert.deepEqual(validateProtocolInventory(inventory), []);
  for (let i = 0; i < inventory.gates.length; i++) {
    for (const status of ['ACCEPTED', 'STABLE', 'PASS', 'CLOSED', undefined]) {
      const mutated = structuredClone(inventory); mutated.gates[i].acceptanceStatus = status;
      assert.ok(validateProtocolInventory(mutated).some(x => x.includes('acceptance status change')), `${inventory.gates[i].id} ${status}`);
    }
    const changedRecord = structuredClone(inventory);
    changedRecord.gates[i].acceptanceRecord = 'docs/compatibility/SDK_COMPATIBILITY.md';
    assert.ok(validateProtocolInventory(changedRecord).some(x => x.includes('acceptance record')));
  }
  const duplicate = structuredClone(inventory); duplicate.gates[13] = structuredClone(duplicate.gates[0]);
  assert.ok(validateProtocolInventory(duplicate).some(x => x.includes('duplicated')));
  assert.ok(validateProtocolInventory({ ...inventory, stableProtocolDeclared: true }).length > 0);
  assert.ok(validateProtocolInventory({ ...inventory, mainnetAdmitted: true }).length > 0);
});
test('historical Developer Release ledger is preserved byte-exact, not rewritten to newer package evidence', () => {
  const history = readFileSync(new URL('../sdk/release/evidence/public-coordinates-developer-release-2026-09-23.json', import.meta.url));
  assert.equal(createHash('sha256').update(history).digest('hex'), '0f88bbf993163defe53e5c07eb57f17d64decfda8e8db2f7d006a1c750a3b0f0');
});
test('current Descriptor documentation does not infer missing negative parity from historical PR state', () => {
  const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const canonical = read('docs/compatibility/AGENT_DESCRIPTOR_CURRENT_EVIDENCE.md');
  assert.match(canonical, /DESCRIPTOR_INTERFACE_PARITY=IMPLEMENTED/);
  assert.ok(canonical.includes('sdk/conformance/v1/agent-descriptor-interface-fixtures.json'));
  assert.ok(canonical.includes('sdk/conformance/run-descriptor-interface-parity.mjs'));
  for (const path of ['sdk/README.md', 'docs/getting-started/DX3_SDK.md']) {
    assert.ok(read(path).includes('versioned publication/consumer qualification of the bounded five-SDK interface repair'), path);
    assert.doesNotMatch(read(path), /Cross-language malformed-interface parity is not yet established|identical rejection across all five SDKs still needs executable proof/, path);
  }
  const fixture = json('sdk/conformance/v1/agent-descriptor-runtime-fixtures.json');
  for (const item of fixture.descriptorRuntimeCases) assert.ok(canonical.includes('`' + item.id + '`'), `undocumented current fixture case ${item.id}`);
  for (const path of ['SECURITY.md', 'sdk/README.md', 'sdk/conformance/README.md', 'docs/architecture/IMPLEMENTATION_STATUS.md', 'docs/architecture/SDK_DEVELOPER_EXPERIENCE.md', 'docs/compatibility/SDK_COMPATIBILITY.md', 'docs/getting-started/SDK_QUICKSTART.md', 'docs/getting-started/DX3_SDK.md']) {
    const contents = read(path);
    assert.ok(contents.includes('AGENT_DESCRIPTOR_CURRENT_EVIDENCE.md'), path);
    assert.ok(contents.includes('An omitted interface endpoint is permitted; an explicitly empty endpoint is invalid in the current reference parser.'), path);
    assert.doesNotMatch(contents, /shared (?:missing\/blank endpoint\/type negatives|interface-negative source implemented)|runners implement missing-endpoint, blank-endpoint and blank-type negatives|negatives are now implemented across all five|five language runners include missing\/blank endpoint|Malformed-interface validation is exercised by the shared negative fixture runners|refresh\/re-signing and shared interface-negative checks are implemented/i, path);
  }
});

test('coordinated evidence substitution cannot replace the frozen registry ledger', () => {
  const [current, freeze, versions] = release();
  assert.deepEqual(validateReleaseInventory(current, freeze, versions), []);
  const changed = structuredClone(current);
  changed.releaseEvidence = 'README.md';
  for (const item of Object.values(changed.coordinates)) item.evidence = 'README.md';
  assert.deepEqual(validateEvidencePaths(root, [{ label: 'real but unrelated', path: 'README.md' }]), []);
  assert.ok(validateReleaseInventory(changed, freeze, versions).includes('release evidence does not match frozen registry ledger'));
  for (const value of [undefined, '', 'README.md']) {
    assert.ok(validateReleaseInventory(current, { ...freeze, registryEvidence: value }, versions).includes('release evidence does not match frozen registry ledger'));
  }
});
