import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 local fault-control patch is diagnostic-only and localhost-bound', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-local-fault-control-'));
  const target = join(dir, 'provision.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-provision.sh', target);
  const before = await readFile(target, 'utf8');
  assert.equal(before.includes('TRUYN_TESTNET_FAULT_CONTROL=1'), false, 'canonical D-1000 provisioner must remain unchanged');
  assert.ok(before.includes('TRUYN_CONTROL_HOST=127.0.0.1'), 'canonical control plane must already be localhost-bound');

  const run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-local-fault-control.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const after = await readFile(target, 'utf8');
  assert.equal(after.match(/TRUYN_TESTNET_FAULT_CONTROL=1/g)?.length, 1, 'fault control must be enabled exactly once in the diagnostic copy');
  assert.ok(after.includes('TRUYN_CONTROL_HOST=127.0.0.1'), 'fault control must remain inaccessible outside localhost control plane');
  assert.ok(after.includes('TRUYN_DHT_RPC_TIMEOUT_MS=5000\nTRUYN_TESTNET_FAULT_CONTROL=1\nENV'), 'patch must be bounded to the node environment block');

  for (const invariant of [
    'HOST_COUNT=20',
    'STRICT_NODES_PER_HOST=50',
    'DIAGNOSTIC_NODES_PER_HOST_SIZES="10 25 50"',
    'NODE_COUNT=$((HOST_COUNT * NODES_PER_HOST))',
    'TRUYN_PEER_RECORD_TTL_MS=1800000',
    'TRUYN_DHT_RPC_TIMEOUT_MS=5000',
  ]) {
    assert.equal(before.includes(invariant), true, `fixture must contain invariant before patch: ${invariant}`);
    assert.equal(after.includes(invariant), true, `patch must preserve invariant: ${invariant}`);
  }

  const shell = spawnSync('bash', ['-n', target], { encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr || shell.stdout);
  const repeat = spawnSync('python3', ['scripts/patch-class-d-diagnostic-local-fault-control.py', target], { encoding: 'utf8' });
  assert.notEqual(repeat.status, 0, 'fault-control patch must fail closed when applied twice');
});
