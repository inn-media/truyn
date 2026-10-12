import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { inspectSourceState, sourceStateQualified } from '../sdk/conformance/run-descriptor-interface-parity.mjs';

test('Descriptor source attribution detects tracked, staged and untracked inputs from every SDK', () => {
  const root = mkdtempSync(join(tmpdir(), 'truyn-source-identity-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (path, content) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content); };
  try {
    git('init', '-q');
    git('config', 'user.name', 'Conformance Test');
    git('config', 'user.email', 'conformance@example.invalid');
    write('.gitignore', 'build/\n'); write('tracked.txt', 'original\n');
    git('add', '.'); git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'initial fixture');
    const baseline = inspectSourceState(root);
    assert.equal(baseline.clean, true);
    write('build/output.bin', 'ignored build output');
    assert.deepEqual(inspectSourceState(root), baseline);
    for (const path of ['sdk/go/extra.go', 'sdk/java/src/Extra.java', 'sdk/dotnet/Extra.cs', 'sdk/python/src/extra.py', 'sdk/typescript/src/extra.ts']) {
      write(path, 'untracked compilation input');
      const dirty = inspectSourceState(root);
      assert.equal(dirty.sourceSha, baseline.sourceSha);
      assert.equal(dirty.clean, false, path);
      assert.equal(sourceStateQualified(dirty, baseline), false, 'dirty before cannot qualify after removal');
      assert.equal(sourceStateQualified(baseline, dirty), false, 'dirty after cannot qualify');
      rmSync(join(root, path));
      assert.deepEqual(inspectSourceState(root), baseline);
    }
    write('tracked.txt', 'changed\n');
    assert.equal(inspectSourceState(root).clean, false);
    git('add', 'tracked.txt');
    assert.equal(inspectSourceState(root).clean, false, 'staged change is not HEAD');
    git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'changed fixture');
    const advanced = inspectSourceState(root);
    assert.equal(advanced.clean, true);
    assert.notEqual(advanced.sourceSha, baseline.sourceSha);
    assert.equal(sourceStateQualified(baseline, advanced), false, 'HEAD movement cannot inherit exact-source proof');
    assert.equal(sourceStateQualified(advanced, advanced), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
