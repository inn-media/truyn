import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('D-200 recovery source patch bounds restart budget without weakening acceptance', async () => {
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
  assert.equal(runtimeBefore.includes(oldDelays), true);
  assert.equal(provisionBefore.includes(oldUnit), true);
  assert.equal(provisionBefore.includes('TimeoutStopSec='), false);
  const run = spawnSync('python3', ['scripts/patch-d200-recovery-budget.py', runtime, provision], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const runtimeAfter = await readFile(runtime, 'utf8');
  const provisionAfter = await readFile(provision, 'utf8');
  assert.equal(runtimeAfter, runtimeBefore.replace(oldDelays, newDelays));
  assert.equal(provisionAfter, provisionBefore.replace(oldUnit, newUnit));
  assert.equal((provisionAfter.match(/TimeoutStopSec=15s/g) || []).length, 1);
  const retryDelaysMs = [500, 1_500, 5_000, 10_000, 20_000];
  const deterministicEnvelopeMs = 15_000 + 2_000 + retryDelaysMs.reduce((a, b) => a + b, 0) + (retryDelaysMs.length + 1) * 5_000;
  assert.equal(deterministicEnvelopeMs, 84_000);
  assert.ok(deterministicEnvelopeMs < 120_000);
  const restartPatch = await readFile('scripts/patch-class-d-diagnostic-restart-parallel.py', 'utf8');
  assert.ok(restartPatch.includes("assert float('$recovery_p95') <= 120000, '$recovery_p95'"));
  assert.ok(restartPatch.includes('"\\$pending" == 0'));
  assert.ok(restartPatch.includes('"\\$valid" -ge ${BOOTSTRAP_MAX_PEERS_PER_NODE}'));
  assert.ok(restartPatch.includes('"\\$hosts" -ge 2'));
  for (const invariant of ['TRUYN_PEER_RECORD_TTL_MS=1800000', 'TRUYN_DHT_RPC_TIMEOUT_MS=5000', 'BOOTSTRAP_MAX_PEERS_PER_NODE=32']) {
    assert.equal(provisionAfter.includes(invariant), provisionBefore.includes(invariant), `${invariant} changed unexpectedly`);
  }
  assert.equal(spawnSync('bash', ['-n', provision], { encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync(process.execPath, ['--check', runtime], { encoding: 'utf8' }).status, 0);
  const second = spawnSync('python3', ['scripts/patch-d200-recovery-budget.py', runtime, provision], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'patch must fail closed on a second application');
});
