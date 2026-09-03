import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 composed heal diagnostics apply universal evidence before packet/healed patches and preserve strict gates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-composed-heal-'));
  const target = join(dir, 'campaign.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-campaign.sh', target);
  const before = await readFile(target, 'utf8');
  const provision = await readFile('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');

  const run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-composed-heal-evidence.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /TRUYN_D200_COMPOSED_PATCH=PASS order=failure-evidence,packet-partition,healed-reconvergence/);

  const after = await readFile(target, 'utf8');
  assert.equal(after.match(/d200_failure_evidence_checkpoint\(\) \{/g)?.length, 1, 'universal failure helper must be installed exactly once');
  assert.equal(after.match(/d200_err_trap\(\) \{/g)?.length, 1, 'universal ERR helper must be installed exactly once');
  assert.ok(after.includes('PACKET_DIAG_PHASE=heal-timeout'), 'packet heal diagnostics must remain installed');
  assert.ok(after.includes('TRUYN_D200_FAILURE_EVIDENCE=CHECKPOINT stage=packet-partition'), 'packet-specific checkpoint marker must coexist with universal checkpoint helper');
  assert.ok(after.includes('HEALED_DIAG_B64='), 'healed reconvergence classifier must be installed');
  assert.ok(after.includes('class-d-200-healed-reconvergence.json'), 'healed classifier artifact must be retained');
  assert.ok(after.includes("assert float('$healed_rate') >= .99, '$healed_rate'"), 'first-attempt healed acceptance must remain >=99%');
  assert.ok(after.includes('[[ "$partition_recovery_ms" -le 120000 ]]'), 'packet recovery must remain <=120s');

  for (const invariant of [
    ': "${HOST_COUNT:?source class-d-azure-1000-provision.sh first}"',
    ': "${NODES_PER_HOST:?source class-d-azure-1000-provision.sh first}"',
    ': "${NODE_COUNT:?source class-d-azure-1000-provision.sh first}"',
  ]) {
    assert.equal(before.includes(invariant), true, `campaign fixture must contain invariant before composition: ${invariant}`);
    assert.equal(after.includes(invariant), true, `composition must preserve campaign invariant: ${invariant}`);
  }

  for (const invariant of [
    'HOST_COUNT=20',
    'STRICT_NODES_PER_HOST=50',
    'DIAGNOSTIC_NODES_PER_HOST_SIZES="10 25 50"',
    'NODE_COUNT=$((HOST_COUNT * NODES_PER_HOST))',
  ]) {
    assert.equal(provision.includes(invariant), true, `canonical provisioner must preserve sizing invariant: ${invariant}`);
  }

  const shell = spawnSync('bash', ['-n', target], { encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr || shell.stdout);

  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-composed-heal-evidence.py', target], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'composed patch must fail closed when applied twice');
});
