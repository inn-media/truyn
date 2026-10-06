import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('D-500 fail-collect waits for every host before returning RED', async () => {
  const provision = await readFile('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');
  const start = provision.indexOf('host_status_arm()');
  const end = provision.indexOf('d200_failure_evidence_checkpoint()', start);
  assert.ok(start >= 0 && end > start, 'fail-collect helpers must be extractable');
  const helpers = provision.slice(start, end);
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d500-failcollect-'));
  try {
    const script = `
set -Eeuo pipefail
D500_HEARTBEAT_SECONDS=1
${helpers}
status_dir='${dir}'
cleanup_sentinel='${dir}/cleanup-fired'
trap 'printf cleanup >"$cleanup_sentinel"; exit 97' ERR
pids=()
(
  host_status_arm "$status_dir" 0
  sleep 0.1
  printf host0 >"$status_dir/0"
) &
pids+=("$!")
(
  host_status_arm "$status_dir" 1
  sleep 0.2
  printf host1-failure >"$status_dir/1.err"
  exit 7
) &
pids+=("$!")
(
  host_status_arm "$status_dir" 2
  sleep 0.4
  printf finished >"$status_dir/host2-finished"
  printf host2 >"$status_dir/2"
) &
pids+=("$!")
stage_rc=0
if ! wait_host_stage synthetic "$status_dir" "${pids[@]}"; then stage_rc=1; fi
[[ "$stage_rc" == 1 ]]
[[ -f "$status_dir/host2-finished" ]]
[[ "$(cat "$status_dir/.host-0.rc")" == 0 ]]
[[ "$(cat "$status_dir/.host-1.rc")" == 7 ]]
[[ "$(cat "$status_dir/.host-2.rc")" == 0 ]]
[[ ! -e "$cleanup_sentinel" ]]
echo FAIL_COLLECT_TEST=PASS
`;
    const run = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
    assert.equal(run.status, 0, `stdout=${run.stdout}\nstderr=${run.stderr}`);
    assert.match(run.stdout, /TRUYN_D500_HOST_RESULT stage=synthetic host=0 rc=0 status=PASS/);
    assert.match(run.stdout, /TRUYN_D500_HOST_RESULT stage=synthetic host=1 rc=7 status=FAIL/);
    assert.match(run.stdout, /TRUYN_D500_HOST_RESULT stage=synthetic host=2 rc=0 status=PASS/);
    assert.match(run.stdout, /TRUYN_D500_HOST_SUMMARY stage=synthetic total=3 completed=3 failed=1 passed=2/);
    assert.match(run.stdout, /FAIL_COLLECT_TEST=PASS/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
