import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const finalAcceptance = readFileSync('scripts/class-d-1000-final-acceptance.sh', 'utf8');
const acceptedBoundary = readFileSync('scripts/lib/class-d-run-command.sh', 'utf8');

test('D-1000 preparation delegates Azure RunCommand to the accepted D-100 boundary', () => {
  assert.match(finalAcceptance, /source "\$ROOT\/scripts\/lib\/class-d-run-command\.sh"/);
  assert.match(finalAcceptance, /truyn_class_d_remote "\$RG" "\$vm" "\$body"/);
  assert.match(finalAcceptance, /legacy D-1000 value\[0\]\.message RunCommand boundary survived preparation/);
  assert.match(finalAcceptance, /legacy D-1000 whole-guest RunCommand retry survived preparation/);

  assert.match(acceptedBoundary, /TRUYN_GUEST_EXECUTION_ADMITTED=1/);
  assert.match(acceptedBoundary, /--query 'value\[\]\.message'/);
});

test('D-1000 prepare-only fails closed and emits the strengthened immutable marker without Azure mutation', () => {
  const result = spawnSync('bash', ['scripts/class-d-1000-final-acceptance.sh'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TRUYN_CLASS_D1000_PREPARE_ONLY: '1',
    },
    encoding: 'utf8',
    timeout: 120_000,
  });

  assert.equal(result.status, 0, `prepare-only failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(
    result.stdout,
    /TRUYN_CLASS_D1000_PREPARED_HARNESS=PASS .*runCommandBoundary=accepted-d100/,
  );
  assert.doesNotMatch(result.stdout + result.stderr, /TRUYN_CLASS_D_1000 stage=network/);
});

test('missing READY diagnostic is preserved in the prepared D-1000 harness', () => {
  assert.match(finalAcceptance, /printf '%s\\\\n' "\$out" >&2/);
  assert.match(finalAcceptance, /missing_ready expected=\$NODES_PER_HOST/);
});
