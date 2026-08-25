import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const testFile = fileURLToPath(new URL('../sdk/typescript/test/core.test.ts', import.meta.url));

test('DX-1 TypeScript SDK core passes shared conformance fixtures', () => {
  const run = spawnSync(process.execPath, ['--experimental-strip-types', '--test', testFile], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env
  });
  assert.equal(
    run.status,
    0,
    `TypeScript SDK conformance failed\nSTDOUT:\n${run.stdout || ''}\nSTDERR:\n${run.stderr || ''}`
  );
});
