import test from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

test('global status indexes preserve evidence-qualified cross-repository statuses', () => {
  const output = execFileSync(process.execPath, ['scripts/check-global-status-consistency.mjs'], {encoding:'utf8'});
  assert.match(output, /GLOBAL_STATUS_CONSISTENCY=PASS/);
});
