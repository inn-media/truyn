import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Python DX-1 core passes the exact shared conformance fixtures', () => {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const run = spawnSync(
    python,
    ['-m', 'unittest', 'discover', '-s', 'sdk/python/tests', '-p', 'test_*.py', '-v'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PYTHONPATH: ['sdk/python/src', process.env.PYTHONPATH]
          .filter(Boolean)
          .join(process.platform === 'win32' ? ';' : ':')
      },
      encoding: 'utf8'
    }
  );
  assert.equal(run.status, 0, `Python conformance failed\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`);
});
