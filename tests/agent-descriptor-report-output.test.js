import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, linkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeDescriptorParityReport } from '../sdk/conformance/descriptor-report-output.mjs';

test('Descriptor report cannot mutate the checkout or an existing external alias', () => {
  const work = mkdtempSync(join(tmpdir(), 'descriptor-report-'));
  const root = join(work, 'repo'), outside = join(work, 'reports');
  mkdirSync(root); mkdirSync(outside);
  const source = join(root, 'model.cs'), content = 'original source\n';
  writeFileSync(source, content);
  try {
    for (const target of [source, join(root, 'new.go'), join(outside, '..', 'repo', 'new.java')]) {
      assert.throws(() => writeDescriptorParityReport(root, target, {}), /outside the repository/);
    }
    symlinkSync(root, join(outside, 'repo-link'), 'dir');
    assert.throws(() => writeDescriptorParityReport(root, join(outside, 'repo-link', 'new.ts'), {}), /outside the repository/);
    symlinkSync(source, join(outside, 'source-link'), 'file');
    linkSync(source, join(outside, 'source-hardlink'));
    for (const file of ['source-link', 'source-hardlink']) {
      assert.throws(() => writeDescriptorParityReport(root, join(outside, file), {}), { code: 'EEXIST' });
    }
    symlinkSync(root, join(work, 'checkout-alias'), 'dir');
    assert.throws(() => writeDescriptorParityReport(join(work, 'checkout-alias'), source, {}), /outside the repository/);
    const report = { passed: true, sourceSha: 'test' }, target = join(outside, 'report.json');
    assert.equal(writeDescriptorParityReport(root, target, report), target);
    assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), report);
    assert.throws(() => writeDescriptorParityReport(root, target, {}), { code: 'EEXIST' });
    assert.equal(readFileSync(source, 'utf8'), content);
    assert.equal(existsSync(join(root, 'new.go')), false);
    assert.equal(existsSync(join(root, 'new.ts')), false);
  } finally { rmSync(work, { recursive: true, force: true }); }
});
