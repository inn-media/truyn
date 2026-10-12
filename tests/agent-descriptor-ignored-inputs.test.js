import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { inspectSourceState, sourceStateQualified } from '../sdk/conformance/descriptor-source-state.mjs';

test('ignored SDK compilation inputs cannot acquire exact-commit evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'descriptor-ignored-inputs-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (path, content = 'unversioned input') => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  try {
    git('init', '-q'); git('config', 'user.name', 'Conformance Test'); git('config', 'user.email', 'conformance@example.invalid');
    write('.gitignore', 'bin/\nobj/\nbuild/\ntarget/\n__pycache__/\n*.egg-info/\n*.hidden.*\n');
    write('tracked.txt'); git('add', '.'); git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'source fixture');
    const before = inspectSourceState(root);
    assert.equal(before.clean, true);
    const bad = [
      'sdk/go/bin/extra.go', 'sdk/go/obj/extra.go', 'sdk/go/target/sub/extra.go',
      'sdk/go/build/data.json', 'sdk/go/extra.hidden.go', 'sdk/java/src/main/java/bin/Extra.java',
      'sdk/dotnet/Extra.hidden.cs', 'sdk/dotnet/conformance/Extra.hidden.cs',
      'sdk/python/src/pkg/extra.hidden.py', 'sdk/python/tests/__pycache__/extra.py',
      'sdk/typescript/src/bin/extra.ts', 'sdk/typescript/test/extra.hidden.ts',
      'sdk/conformance/bin/extra.mjs', 'core/identity/bin/extra.js'
    ];
    for (const path of bad) {
      write(path);
      assert.equal(git('status', '--porcelain', '--untracked-files=all').trim(), '', `${path}: ignored by normal status`);
      const dirty = inspectSourceState(root);
      assert.equal(dirty.clean, false, path);
      assert.deepEqual(dirty.unexpectedIgnoredInputs, [path]);
      assert.equal(sourceStateQualified(before, dirty), false);
      assert.equal(sourceStateQualified(dirty, before), false);
      rmSync(join(root, path));
      assert.deepEqual(inspectSourceState(root), before);
    }
    for (const path of ['build/output.bin', 'sdk/dotnet/bin/Release/net8.0/Truyn.Sdk.dll', 'sdk/dotnet/obj/Release/net8.0/Truyn.Sdk.AssemblyInfo.cs', 'sdk/dotnet/conformance/obj/project.assets.json', 'sdk/python/src/pkg/__pycache__/api.cpython-312.pyc', 'sdk/python/src/truyn_sdk.egg-info/PKG-INFO']) write(path);
    assert.deepEqual(inspectSourceState(root), before, 'known outputs outside source inclusion must not dirty the source snapshot');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
