import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('exact five-SDK artifact and evidence negatives execute, rather than checking status strings', () => {
  const result = spawnSync('python3', ['tests/fixtures/five-sdk-evidence-unit.py', '-v'], {
    encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stderr, /Ran 8 tests/);
  assert.match(result.stderr, /\bOK\b/);
});

test('exact source checkout and post-merge qualification cannot silently disappear', () => {
  const workflow = readFileSync(new URL('../.github/workflows/truyn1-five-published-freeze-interop.yml', import.meta.url), 'utf8');
  assert.match(workflow, /ref: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/);
  assert.match(workflow, /TRUYN_EXPECTED_SOURCE_SHA:/);
  assert.match(workflow, /push:\s+branches: \[main\]/);
  assert.match(workflow, /dotnet nuget verify/);
  assert.match(workflow, /if-no-files-found: error/);
  for (const lang of ['typescript', 'python', 'go', 'java', 'dotnet']) {
    assert.ok(workflow.includes('artifact ' + lang), lang + ' artifact identity verification required');
  }
});
