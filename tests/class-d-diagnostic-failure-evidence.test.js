import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 universal failure evidence checkpoints any campaign stage without changing strict sizing or cleanup semantics', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-failure-evidence-'));
  const target = join(dir, 'provision.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-provision.sh', target);
  const before = await readFile(target, 'utf8');

  const run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-failure-evidence.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);

  const after = await readFile(target, 'utf8');
  assert.ok(after.includes('d200_failure_evidence_checkpoint()'), 'universal checkpoint helper must be installed');
  assert.ok(after.includes('d200_err_trap()'), 'ERR trap must route through the universal checkpoint');
  assert.ok(after.includes('TRUYN_D200_FAILURE_EVIDENCE=CHECKPOINT'), 'checkpoint must emit a durable marker');
  assert.ok(after.includes('TRUYN_D200_FAILURE_EVIDENCE=RETAINED'), 'stage-specific richer evidence must be retained instead of overwritten');
  assert.ok(after.includes('tmp="${EVIDENCE}.d200-failure.tmp"'), 'checkpoint must use an atomic temporary file');
  assert.ok(after.includes('mv "$tmp" "$EVIDENCE"'), 'checkpoint must publish the cleanup-visible canonical evidence file atomically');
  assert.ok(after.includes('D200_HEALED_RATE="${healed_rate:-}"'), 'late healed-routing metrics must be captured when available');
  assert.ok(after.includes('D200_POST_RATE="${post_rate:-}"'), 'post-restart metrics must be captured when available');
  assert.ok(after.includes('D200_PARTITION_RECOVERY_MS="${partition_recovery_ms:-}"'), 'packet recovery timing must be captured when available');
  assert.ok(after.includes("'evidenceComplete': False"), 'partial evidence must never claim completeness');
  assert.ok(after.includes("'finalizedByExitTrap': True"), 'cleanup trap must remain authoritative for cleanup fields');
  assert.ok(after.includes('trap \'d200_err_trap "$?" "$STAGE" "$LINENO"\' ERR'), 'all ERR stages must flow through the checkpoint');

  for (const invariant of [
    'HOST_COUNT=20',
    'STRICT_NODES_PER_HOST=50',
    'DIAGNOSTIC_NODES_PER_HOST_SIZES="10 25 50"',
    'NODE_COUNT=$((HOST_COUNT * NODES_PER_HOST))',
    'TRUYN_CLASS_D_1000_CLEANUP confirmed=${CLEANUP_CONFIRMED} remaining=${left}',
  ]) {
    assert.equal(after.includes(invariant), true, `strict harness invariant must remain: ${invariant}`);
    assert.equal(before.includes(invariant), true, `fixture must contain invariant before patch: ${invariant}`);
  }
  assert.ok(after.includes("jq --argjson confirmed \"$CLEANUP_CONFIRMED\" --argjson remaining \"$left\" '.cleanup.confirmed=$confirmed | .cleanup.remainingResources=$remaining'"),
    'existing cleanup mutation must remain unchanged');

  const shell = spawnSync('bash', ['-n', target], { encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr || shell.stdout);
  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-failure-evidence.py', target], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'universal failure patch must fail closed when applied twice');
});
