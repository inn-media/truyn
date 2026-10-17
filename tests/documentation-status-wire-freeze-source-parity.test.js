import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = file => readFileSync(file, 'utf8');
const json = file => JSON.parse(read(file));
const base = 'docs/compatibility/';
const core = read(base + 'TRUYN_WIRE_FREEZE_CORE_SOURCE_PARITY_EN.md');
const composed = read(base + 'TRUYN_WIRE_FREEZE_COMPOSED_SOURCE_PARITY_EN.md');
const extensions = read(base + 'TRUYN_WIRE_FREEZE_EXTENSIONS_FINAL_EN.md');
const review = read(base + 'TRUYN1_CLASS_C_WIRE_SOURCE_SEMANTIC_REVIEW.md');
const registry = json('spec/registry/truyn-core-v1.json');
const manifest = json(base + 'TRUYN1_WIRE_FREEZE_FINAL_SOURCES_20261013.json');

test('CORE approved-source rows match all frozen machine CODE/name values without rewriting Short', () => {
  assert.equal(registry.entries.length, 80);
  const items = [...core.matchAll(/^\|\s*\x60(\d{8})\x60\s*\|\s*\x60([^\x60]+)\x60\s*\|\s*\x60([^\x60]+)\x60\s*\|\s*\x60([^\x60]+)\x60\s*\|/gm)];
  assert.equal(items.length, 80, 'all 80 source-approved CORE rows must remain visible');
  const seen = new Set();
  let conflictingShort = 0;
  for (const item of items) {
    const [, code, originalShort, machineShort, name] = item;
    assert(!seen.has(code), 'duplicate source CORE code: ' + code);
    seen.add(code);
    const machine = registry.entries.find(x => x.code === code);
    assert(machine, 'missing machine CORE code: ' + code);
    assert.equal(machine.name, name);
    assert.equal(machine.short ?? '—', machineShort);
    if (originalShort !== machineShort) conflictingShort++;
  }
  assert.equal(conflictingShort, 41, 'do not silently harmonize documentary-vs-executable Short aliases');
  assert.match(review, /C-ALIAS-01/);
  assert.match(review, /C-ERROR-02/);
  assert.match(review, /C-PROTO-03/);
});

test('non-CORE has exactly the source 10+4 candidates and all 111 COMPOSED implementations', () => {
  const expectedExtensions = [
    'DISCONNECT','PAUSE','RESUME','DELEGATE','HANDOFF','RETRIEVE','DELETE','EVENT','LEASE','BID'
  ];
  const expectedProfiles = ['TIME_SYNC','SENSOR_DATA','SAFE_STOP','ALARM'];
  const candidates = [...extensions.matchAll(/^\|\s*([A-Z_]+)\s*\|\s*(EXTENSION|PROFILE)\s*\|/gm)];
  assert.equal(candidates.length, 14);
  assert.deepEqual(candidates.filter(x => x[2] === 'EXTENSION').map(x => x[1]), expectedExtensions);
  assert.deepEqual(candidates.filter(x => x[2] === 'PROFILE').map(x => x[1]), expectedProfiles);
  const details = [...composed.matchAll(/^\|\s*[A-K]\s*\|\s*\x60([A-Z_]+)\x60\s*\|\s*(Scenario|Attribute|Operation|Object|Data|Status|Transport)\s*\|\s*([^|]+)\|\s*([^|]+)\|/gm)];
  assert.equal(details.length, 111);
  assert.equal(new Set(details.map(x => x[1])).size, 111);
  for (const x of details) {
    assert(x[3].trim().length > 6, 'untranslated purpose: ' + x[1]);
    assert(x[4].trim().length > 8, 'untranslated mechanism: ' + x[1]);
  }
  for (const [name, count] of [['EXTENSION',10],['PROFILE',4],['COMPOSED',111]])
    assert.equal(manifest.sourceCoverage[name === 'EXTENSION' ? 'nonCoreExtensionCandidates' : name === 'PROFILE' ? 'profileCandidates' : 'composedRows'], count);
});

test('approved raw source hashes never masquerade as English-document hashes', () => {
  assert.equal(manifest.approvedOriginals.length, 2);
  assert.deepEqual(manifest.approvedOriginals.map(x => x.sha256), [
    '591e0f92d494626b32090223e4756f2f431a2ad6179074b0066902112ea9d121',
    'c345631992e3e96f84e67dcf48a85c15281f5912ae1bfd131c5f904b9da46e72'
  ]);
  assert.equal(manifest.derivedEnglishDocuments.length, 5);
  const allowed = new Set(manifest.approvedOriginals.map(x => x.sha256));
  for (const entry of manifest.derivedEnglishDocuments) {
    const content = read(entry.path);
    const digest = createHash('sha256').update(content).digest('hex');
    assert.equal(digest, entry.sha256, entry.path);
    assert(!allowed.has(entry.sha256), 'derivative claims original source digest');
    assert(!/[\u0400-\u04ff]/u.test(content), 'non-English documentation prose in derivative');
  }
  assert.equal(manifest.review.stableProtocolAdmitted, false);
  assert.equal(manifest.review.extensionWireAdmitted, false);
  assert.equal(manifest.review.minimumCalendarDays, 14);
});
