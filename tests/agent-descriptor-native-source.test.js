import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { stageDescriptorNativeSource } from '../sdk/conformance/descriptor-native-source.mjs';

test('native staging cannot consume incremental checkout artifacts or uncommitted sources', () => {
  const work = mkdtempSync(join(tmpdir(), 'descriptor-native-test-')), root = join(work, 'repo'); mkdirSync(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  try {
    git('init', '-q'); git('config', 'user.name', 'Conformance Test'); git('config', 'user.email', 'conformance@example.invalid');
    write('.gitignore', 'bin/\nobj/\ntarget/\n');
    for (const path of ['sdk/java/pom.xml', 'sdk/dotnet/Truyn.Sdk.csproj', 'sdk/dotnet/conformance/Truyn.Sdk.Conformance.csproj', 'sdk/java/src/Main.java', 'sdk/dotnet/Models.cs']) write(path, 'committed source\n');
    git('add', '.'); git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'source'); const sha = git('rev-parse', 'HEAD').trim();
    for (const path of ['sdk/java/target/classes/Main.class', 'sdk/dotnet/bin/Release/Truyn.Sdk.dll', 'sdk/dotnet/conformance/obj/cache']) write(path, 'poisoned cache');
    write('sdk/java/src/Main.java', 'uncommitted replacement');
    const staged = stageDescriptorNativeSource(root, sha, work);
    assert.equal(readFileSync(join(staged.directory, 'sdk/java/src/Main.java'), 'utf8'), 'committed source\n');
    for (const path of ['sdk/java/target', 'sdk/dotnet/bin', 'sdk/dotnet/conformance/obj']) assert.equal(existsSync(join(staged.directory, path)), false, path);
    assert.equal(readFileSync(join(root, 'sdk/java/target/classes/Main.class'), 'utf8'), 'poisoned cache');
    assert.equal(staged.sourceSha, sha); assert.equal(Object.keys(staged.sourceBlobs).length, 5);
    const again = stageDescriptorNativeSource(root, sha, work); assert.notEqual(staged.directory, again.directory); assert.deepEqual(staged.sourceBlobs, again.sourceBlobs);
    git('add', '-f', 'sdk/java/target/classes/Main.class'); git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'tracked output attack');
    assert.throws(() => stageDescriptorNativeSource(root, git('rev-parse', 'HEAD').trim(), work), /build output/);
  } finally { rmSync(work, { recursive: true, force: true }); }
});
