import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { conformanceEnvironment, assertExactDescriptorQualification } from '../sdk/conformance/descriptor-qualification-policy.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const policy = new URL('../sdk/conformance/descriptor-qualification-policy.mjs', import.meta.url).href;
const sha = 'a'.repeat(40);
const accepted = () => ({ passed: true, workingTreeClean: true, exactSourceQualified: true,
  sourceSha: sha, sourceShaAfter: sha, sourceBefore: { clean: true, sourceSha: sha }, sourceAfter: { clean: true, sourceSha: sha } });
test('Go conformance refuses injected flags and disables persisted flags/workspaces', () => {
  for (const flags of ['-overlay=/tmp/overlay.json', '-overlay /tmp/overlay.json', '-modfile=/tmp/other.mod', '-toolexec=/tmp/wrapper', '-tags=foreign']) {
    assert.throws(() => conformanceEnvironment({ GOFLAGS: flags }), /empty GOFLAGS/);
    assert.throws(() => conformanceEnvironment({ goflags: flags }), /empty GOFLAGS/);
  }
  const input = { PATH: '/toolchain', GOENV: '/tmp/foreign-go-env', GOWORK: '/tmp/foreign.work', GOFLAGS: '  ', TRUYN_DESCRIPTOR_CASES_FILE: '/tmp/fixture' };
  const env = conformanceEnvironment(input);
  assert.equal(env.GOENV, 'off'); assert.equal(env.GOWORK, 'off'); assert.equal(env.GOFLAGS, '');
  assert.equal(env.PATH, input.PATH); assert.equal(env.TRUYN_DESCRIPTOR_CASES_FILE, input.TRUYN_DESCRIPTOR_CASES_FILE);
  assert.equal(input.GOENV, '/tmp/foreign-go-env');
});
test('diagnostic-only source states fail the actual command exit, even with functional PASS', () => {
  assert.doesNotThrow(() => assertExactDescriptorQualification(accepted()));
  const variants = [
    { ...accepted(), passed: false },
    { ...accepted(), workingTreeClean: false, exactSourceQualified: false },
    { ...accepted(), sourceBefore: { clean: false, sourceSha: sha } },
    { ...accepted(), sourceAfter: { clean: false, sourceSha: sha } },
    { ...accepted(), sourceShaAfter: 'b'.repeat(40) },
    { ...accepted(), sourceBefore: { clean: true, sourceSha: 'b'.repeat(40) } },
    { ...accepted(), exactSourceQualified: false }
  ];
  for (const report of variants) {
    const child = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import { assertExactDescriptorQualification as check } from ${JSON.stringify(policy)}; check(${JSON.stringify(report)}); console.log('PASS');`], { encoding: 'utf8' });
    assert.notEqual(child.status, 0); assert.match(child.stderr, /exact-source qualification failed/);
    assert.doesNotMatch(child.stdout, /PASS/);
  }
});
test('both real qualification entry points reject overlay before any SDK execution', () => {
  for (const entry of ['sdk/conformance/run-descriptor-interface-parity.mjs', 'sdk/conformance/run-five-language-e2e.mjs']) {
    const child = spawnSync(process.execPath, [entry], { cwd: root, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, GOFLAGS: '-overlay=/tmp/descriptor-untrusted-overlay.json' } });
    assert.notEqual(child.status, 0, entry); assert.match(child.stderr, /empty GOFLAGS/, entry);
    assert.doesNotMatch(child.stdout, /PASS|DESCRIPTOR_INTERFACE_PARITY_REPORT=/, entry);
  }
});
