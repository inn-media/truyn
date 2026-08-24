import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const finalAcceptance = readFileSync('scripts/class-d-1000-final-acceptance.sh', 'utf8');
const acceptedBoundary = readFileSync('scripts/lib/class-d-run-command.sh', 'utf8');

test('D-1000 preparation delegates Azure RunCommand to the accepted terminal-aware boundary', () => {
  assert.match(finalAcceptance, /source "\$ROOT\/scripts\/lib\/class-d-run-command\.sh"/);
  assert.match(finalAcceptance, /truyn_class_d_remote "\$RG" "\$vm" "\$body"/);
  assert.match(finalAcceptance, /legacy D-1000 value\[0\]\.message RunCommand boundary survived preparation/);
  assert.match(finalAcceptance, /legacy D-1000 whole-guest RunCommand retry survived preparation/);
  assert.match(acceptedBoundary, /TRUYN_GUEST_EXECUTION_ADMITTED=1/);
  assert.match(acceptedBoundary, /TRUYN_GUEST_TERMINAL_/);
  assert.match(acceptedBoundary, /TRUYN_GUEST_TERMINAL_MISSING/);
  assert.match(acceptedBoundary, /TRUYN_GUEST_ADMISSION_MISSING/);
  assert.match(acceptedBoundary, /--query 'value\[\]\.message'/);
});

function runBoundary({ mode, body }) {
  const dir = mkdtempSync(join(tmpdir(), 'truyn-d100-boundary-'));
  const countFile = join(dir, 'count');
  const errFile = join(dir, 'err');
  const azPath = join(dir, 'az');
  writeFileSync(azPath, `#!/usr/bin/env bash
set -u
count=0
[[ -f "$AZ_COUNT_FILE" ]] && count="$(cat "$AZ_COUNT_FILE")"
count=$((count+1))
printf '%s' "$count" >"$AZ_COUNT_FILE"
script=''
prev=''
for arg in "$@"; do
  if [[ "$prev" == '--scripts' ]]; then script="$arg"; break; fi
  prev="$arg"
done
case "$AZ_MODE" in
  execute)
    set +e
    /bin/bash -c "$script"
    exit 0
    ;;
  missing-terminal)
    echo 'TRUYN_GUEST_EXECUTION_ADMITTED=1'
    exit 0
    ;;
  busy-then-execute)
    if [[ "$count" == 1 ]]; then
      echo 'managed VM RunCommand extension execution is in progress' >&2
      exit 1
    fi
    /bin/bash -c "$script"
    exit 0
    ;;
  *) exit 97 ;;
esac
`);
  chmodSync(azPath, 0o755);

  const shell = `
set +e
source scripts/lib/class-d-run-command.sh
out="$(truyn_class_d_remote rg vm "$TRUYN_TEST_BODY" 2>"$TRUYN_TEST_ERR")"
rc=$?
printf 'RC=%s\\n' "$rc"
printf 'OUT_BEGIN\\n%s\\nOUT_END\\n' "$out"
printf 'ERR_BEGIN\\n'
cat "$TRUYN_TEST_ERR"
printf 'ERR_END\\n'
exit 0
`;
  const result = spawnSync('bash', ['-c', shell], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      AZ_MODE: mode,
      AZ_COUNT_FILE: countFile,
      TRUYN_TEST_BODY: body,
      TRUYN_TEST_ERR: errFile,
      TRUYN_AZ_RUN_COMMAND_BUSY_SLEEP_SECONDS: '0',
    },
    encoding: 'utf8',
    timeout: 30_000,
  });
  const calls = Number(readFileSync(countFile, 'utf8'));
  rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
  return { stdout: result.stdout, calls };
}

test('explicit guest terminal rc overrides Azure extension success and is never replayed', () => {
  const result = runBoundary({ mode: 'execute', body: 'echo PAYLOAD_BEFORE_FAILURE; exit 7' });
  assert.match(result.stdout, /RC=7/);
  assert.match(result.stdout, /TRUYN_GUEST_EXECUTION_ADMITTED=1/);
  assert.match(result.stdout, /TRUYN_GUEST_TERMINAL_.*=7/);
  assert.match(result.stdout, /TRUYN_GUEST_TERMINAL_FAILURE vm=vm rc=7/);
  assert.equal(result.calls, 1);
});

test('admitted execution without a terminal marker fails closed and is never replayed', () => {
  const result = runBoundary({ mode: 'missing-terminal', body: 'echo SHOULD_NOT_RUN' });
  assert.match(result.stdout, /RC=125/);
  assert.match(result.stdout, /TRUYN_GUEST_TERMINAL_MISSING vm=vm/);
  assert.equal(result.calls, 1);
});

test('non-admitted RunCommand busy can retry before one successful guest execution', () => {
  const result = runBoundary({ mode: 'busy-then-execute', body: 'echo READY=50; exit 0' });
  assert.match(result.stdout, /RC=0/);
  assert.match(result.stdout, /READY=50/);
  assert.match(result.stdout, /TRUYN_GUEST_TERMINAL_.*=0/);
  assert.equal(result.calls, 2);
});

test('D-1000 prepare-only still preserves the accepted immutable harness contract', () => {
  const result = spawnSync('bash', ['scripts/class-d-1000-final-acceptance.sh'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TRUYN_CLASS_D1000_PREPARE_ONLY: '1',
      TRUYN_CLASS_D1000_RUNTIME_URL: 'https://example.invalid/runtime.tgz',
      TRUYN_CLASS_D1000_RUNTIME_SHA256: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(result.status, 0, `prepare-only failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  assert.match(result.stdout, /TRUYN_CLASS_D1000_PREPARED_HARNESS=PASS .*runCommandBoundary=accepted-d100 runtimeBundle=sha256-pinned/);
  assert.doesNotMatch(result.stdout + result.stderr, /TRUYN_CLASS_D_1000 stage=network/);
});
