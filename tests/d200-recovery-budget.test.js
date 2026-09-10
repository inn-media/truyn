import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 recovery repair bounds end-to-end restart budget without weakening acceptance', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-recovery-budget-'));
  const runtime = join(dir, 'runtime.js');
  const provision = join(dir, 'provision.sh');
  await copyFile('network/runtime.js', runtime);
  await copyFile('benchmarks/scale/class-d-azure-1000-provision.sh', provision);

  const runtimeBefore = await readFile(runtime, 'utf8');
  const provisionBefore = await readFile(provision, 'utf8');
  const oldDelays = 'this.peerRecordRecoveryRetryDelaysMs = [1_000, 3_000, 10_000, 30_000, 45_000];';
  const newDelays = 'this.peerRecordRecoveryRetryDelaysMs = [500, 1_500, 5_000, 10_000, 20_000];';
  const oldUnit = 'Restart=on-failure\nRestartSec=1\nLimitNOFILE=65536';
  const newUnit = 'Restart=on-failure\nRestartSec=1\nTimeoutStopSec=15s\nLimitNOFILE=65536';
  assert.equal((runtimeBefore.match(/peerRecordRecoveryRetryDelaysMs/g) || []).length >= 1, true);
  assert.equal(runtimeBefore.includes(oldDelays), true, 'expected canonical pre-repair retry schedule');
  assert.equal(provisionBefore.includes(oldUnit), true, 'expected canonical systemd unit anchor');
  assert.equal(provisionBefore.includes('TimeoutStopSec='), false, 'canonical source must not already be patched');

  const run = spawnSync('python3', ['scripts/patch-d200-recovery-budget.py', runtime, provision], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);

  const runtimeAfter = await readFile(runtime, 'utf8');
  const provisionAfter = await readFile(provision, 'utf8');
  assert.equal(runtimeAfter, runtimeBefore.replace(oldDelays, newDelays), 'runtime repair must change only retry backoff');
  assert.equal(provisionAfter, provisionBefore.replace(oldUnit, newUnit), 'provision repair must change only systemd stop bound');
  assert.equal(runtimeAfter.includes(oldDelays), false);
  assert.equal(runtimeAfter.includes(newDelays), true);
  assert.equal((provisionAfter.match(/TimeoutStopSec=15s/g) || []).length, 1);

  const retryDelaysMs = [500, 1_500, 5_000, 10_000, 20_000];
  const stopTimeoutMs = 15_000;
  const disruptionPauseMs = 2_000;
  const rpcTimeoutMs = 5_000;
  const retryRpcAttempts = retryDelaysMs.length;
  const deterministicEnvelopeMs = stopTimeoutMs + disruptionPauseMs + retryDelaysMs.reduce((a, b) => a + b, 0) + retryRpcAttempts * rpcTimeoutMs;
  assert.equal(deterministicEnvelopeMs, 79_000);
  assert.ok(deterministicEnvelopeMs < 120_000, 'deterministic recovery envelope must leave margin below unchanged 120s gate');

  const restartPatch = await readFile('scripts/patch-class-d-diagnostic-restart-parallel.py', 'utf8');
  assert.ok(restartPatch.includes("assert float('$recovery_p95') <= 120000, '$recovery_p95'"), 'strict 120s recovery gate must remain unchanged');
  assert.ok(restartPatch.includes('"\\$pending" == 0'), 'peer-record propagation readiness must remain fail closed');
  assert.ok(restartPatch.includes('"\\$valid" -ge ${BOOTSTRAP_MAX_PEERS_PER_NODE}'), 'peer bound must remain unchanged');
  assert.ok(restartPatch.includes('"\\$hosts" -ge 2'), 'host diversity must remain unchanged');

  for (const invariant of [
    'TRUYN_PEER_RECORD_TTL_MS=1800000',
    'TRUYN_DHT_RPC_TIMEOUT_MS=5000',
    'BOOTSTRAP_MAX_PEERS_PER_NODE=32'
  ]) {
    assert.equal(provisionAfter.includes(invariant), provisionBefore.includes(invariant), `${invariant} must remain unchanged`);
  }

  const shell = spawnSync('bash', ['-n', provision], { encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr || shell.stdout);
  const syntax = spawnSync(process.execPath, ['--check', runtime], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);

  const second = spawnSync('python3', ['scripts/patch-d200-recovery-budget.py', runtime, provision], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'recovery budget patch must fail closed when applied twice');
});
