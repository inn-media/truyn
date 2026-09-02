import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 diagnostic restart patch disrupts five nodes per host in parallel without weakening recovery gates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-restart-parallel-'));
  const target = join(dir, 'campaign.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-campaign.sh', target);
  const before = await readFile(target, 'utf8');
  const beforeRestart = before.indexOf('STAGE=restart-recovery');
  const beforePostRestart = before.indexOf('STAGE=post-restart-routing');
  assert.ok(beforeRestart >= 0 && beforePostRestart > beforeRestart, 'expected bounded restart-recovery block');
  const prefixBefore = before.slice(0, beforeRestart);
  const suffixBefore = before.slice(beforePostRestart);

  const run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-restart-parallel.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);

  let after = await readFile(target, 'utf8');
  const restartStart = after.indexOf('STAGE=restart-recovery');
  const postRestartStart = after.indexOf('STAGE=post-restart-routing');
  assert.ok(restartStart >= 0 && postRestartStart > restartStart, 'expected restart block after patch');
  assert.equal(after.slice(0, restartStart), prefixBefore, 'stages before restart must remain byte-identical');
  assert.equal(after.slice(postRestartStart), suffixBefore, 'stages after restart must remain byte-identical');
  const block = after.slice(restartStart, postRestartStart);

  assert.ok(block.indexOf('t0=\\$(date +%s%3N)') < block.indexOf('systemctl stop truyn-d1000@\\${idx}.service &'), 't0 must remain before disruption');
  assert.equal((block.match(/seq 10 14/g) || []).length, 3, 'strict campaign must still select the same five-node range for stop/start/status');
  assert.ok(block.includes('systemctl stop truyn-d1000@\\${idx}.service &'), 'stop operations must fan out in background');
  assert.ok(block.includes('stop_pids+=("\\$!")'), 'stop PIDs must be collected');
  assert.ok(block.includes('for pid in "\\${stop_pids[@]}"; do'), 'all parallel stops must be waited');
  assert.ok(block.includes('if ! wait "\\$pid"; then stop_failed=1; fi'), 'stop failures must remain fail closed');
  assert.ok(block.includes('[[ "\\$stop_failed" == 0 ]]'), 'stop phase must fail if any node did not stop');

  assert.ok(block.includes('systemctl start truyn-d1000@\\${idx}.service &'), 'start operations must fan out in background');
  assert.ok(block.includes('start_pids+=("\\$!")'), 'start PIDs must be collected');
  assert.ok(block.includes('for pid in "\\${start_pids[@]}"; do'), 'all parallel starts must be waited');
  assert.ok(block.includes('if ! wait "\\$pid"; then start_failed=1; fi'), 'start failures must remain fail closed');
  assert.ok(block.includes('[[ "\\$start_failed" == 0 ]]'), 'start phase must fail if any node did not start');

  assert.ok(block.includes('for n in \\$(seq 1 90); do'), 'readiness retry count must remain unchanged');
  assert.ok(block.includes('curl -fsS --max-time 1 http://127.0.0.1:\\$(( ${CONTROL_BASE}+j ))/status'), 'same /status readiness probe must remain');
  assert.ok(block.includes('[[ \\$good -eq 5 ]]'), 'all five restarted nodes must become ready');
  assert.ok(block.includes("assert float('$recovery_p95') <= 120000, '$recovery_p95'"), 'recovery p95 limit must remain 120000 ms');
  assert.ok(block.includes('restarted=100'), '20 hosts x 5 restarted nodes must remain 100');

  for (const marker of ['STOP_MS=', 'START_MS=', 'READY_MS=', 'RESTART_MS=']) {
    assert.ok(block.includes(marker), `expected diagnostic marker ${marker}`);
  }
  for (const marker of ['stopP95Ms=', 'startP95Ms=', 'readyP95Ms=', 'recoveryP95Ms=']) {
    assert.ok(block.includes(marker), `expected aggregate diagnostic marker ${marker}`);
  }
  for (const marker of ['STOP_MS', 'START_MS', 'READY_MS', 'RESTART_MS']) {
    assert.ok(block.includes(`sed -n 's/^${marker}=//p'`), `expected exact-line parser for ${marker}`);
  }
  assert.equal(block.includes('marker "$out" START_MS'), false, 'START_MS must not use the suffix-matching shared marker helper');
  assert.ok(block.includes('mode=parallel-node-restart'), 'restart evidence must identify parallel node disruption');
  assert.equal(block.includes('TimeoutStopSec'), false, 'patch must not alter systemd/QUIC shutdown policy');
  assert.equal(block.includes('maxIdleTimeout'), false, 'patch must not alter core QUIC timing');

  const markerCollision = spawnSync('bash', ['-c', `
    set -Eeuo pipefail
    out=$'STOP_MS=31\\nSTART_MS=7\\nREADY_MS=2\\nRESTART_MS=42'
    start_ms=$(printf '%s\\n' "$out" | sed -n 's/^START_MS=//p' | tail -1)
    restart_ms=$(printf '%s\\n' "$out" | sed -n 's/^RESTART_MS=//p' | tail -1)
    printf '%s %s\\n' "$start_ms" "$restart_ms"
  `], { encoding: 'utf8' });
  assert.equal(markerCollision.status, 0, markerCollision.stderr || markerCollision.stdout);
  assert.equal(markerCollision.stdout.trim(), '7 42', 'START_MS must remain distinct from RESTART_MS');

  // Reproduce the exact D-200 node-range normalization used by one-shot launchers.
  assert.equal((after.match(/seq 10 14/g) || []).length, 3, 'D-200 range patch precondition must remain exact');
  assert.equal((after.match(/range\(10,15\)/g) || []).length, 1, 'D-200 Python range patch precondition must remain exact');
  after = after.replaceAll('seq 10 14', 'seq 5 9').replaceAll('range(10,15)', 'range(5,10)');
  const d200Block = after.slice(after.indexOf('STAGE=restart-recovery'), after.indexOf('STAGE=post-restart-routing'));
  assert.equal((d200Block.match(/seq 5 9/g) || []).length, 3, 'D-200 must stop/start/check exactly nodes 5..9');
  assert.equal(d200Block.includes('seq 10 14'), false);
  assert.ok(d200Block.includes('restarted=100'), 'D-200 total restart cardinality must remain 100');
  assert.ok(d200Block.includes("assert float('$recovery_p95') <= 120000, '$recovery_p95'"), 'D-200 must keep the same 120s gate');

  const shell = spawnSync('bash', ['-n', target], { encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr || shell.stdout);

  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-restart-parallel.py', target], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'patch must fail closed when applied twice');
});
