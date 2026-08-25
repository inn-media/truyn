import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('TypeScript SDK local-node E2E completes real NEED -> RESULT', () => {
  const run = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--test', 'sdk/typescript/test/local-node-e2e.test.ts'],
    { cwd: process.cwd(), encoding: 'utf8' }
  );
  assert.equal(run.status, 0, `SDK local-node E2E failed\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`);
});
