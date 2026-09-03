import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 composed heal diagnostics apply universal evidence before packet/healed patches and preserve strict gates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-composed-heal-'));
  const provisionTarget = join(dir, 'provision.sh');
  const campaignTarget = join(dir, 'campaign.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-provision.sh', provisionTarget);
  await copyFile('benchmarks/scale/class-d-azure-1000-campaign.sh', campaignTarget);
  const provisionBefore = await readFile(provisionTarget, 'utf8');
  const campaignBefore = await readFile(campaignTarget, 'utf8');

  const run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-composed-heal-evidence.py', provisionTarget, campaignTarget], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /TRUYN_D200_COMPOSED_PATCH=PASS order=failure-evidence,packet-partition,healed-reconvergence/);

  const provisionAfter = await readFile(provisionTarget, 'utf8');
  const campaignAfter = await readFile(campaignTarget, 'utf8');
  assert.equal(provisionAfter.match(/d200_failure_evidence_checkpoint\(\) \{/g)?.length, 1, 'universal failure helper must be installed exactly once on provisioner');
  assert.equal(provisionAfter.match(/d200_err_trap\(\) \{/g)?.length, 1, 'universal ERR helper must be installed exactly once on provisioner');
  assert.ok(campaignAfter.includes('PACKET_DIAG_PHASE=heal-timeout'), 'packet heal diagnostics must remain installed');
  assert.ok(campaignAfter.includes('TRUYN_D200_FAILURE_EVIDENCE=CHECKPOINT stage=packet-partition'), 'packet-specific checkpoint marker must coexist with universal provisioner checkpoint');
  assert.ok(campaignAfter.includes('HEALED_DIAG_B64='), 'healed reconvergence classifier must be installed');
  assert.ok(campaignAfter.includes('class-d-200-healed-reconvergence.json'), 'healed classifier artifact must be retained');
  assert.ok(campaignAfter.includes("assert float('$healed_rate') >= .99, '$healed_rate'"), 'first-attempt healed acceptance must remain >=99%');
  assert.ok(campaignAfter.includes('[[ "$partition_recovery_ms" -le 120000 ]]'), 'packet recovery must remain <=120s');

  for (const invariant of [
    ': "${HOST_COUNT:?source class-d-azure-1000-provision.sh first}"',
    ': "${NODES_PER_HOST:?source class-d-azure-1000-provision.sh first}"',
    ': "${NODE_COUNT:?source class-d-azure-1000-provision.sh first}"',
  ]) {
    assert.equal(campaignBefore.includes(invariant), true, `campaign fixture must contain invariant before composition: ${invariant}`);
    assert.equal(campaignAfter.includes(invariant), true, `composition must preserve campaign invariant: ${invariant}`);
  }

  for (const invariant of [
    'HOST_COUNT=20',
    'STRICT_NODES_PER_HOST=50',
    'DIAGNOSTIC_NODES_PER_HOST_SIZES="10 25 50"',
    'NODE_COUNT=$((HOST_COUNT * NODES_PER_HOST))',
  ]) {
    assert.equal(provisionBefore.includes(invariant), true, `provision fixture must contain sizing invariant before composition: ${invariant}`);
    assert.equal(provisionAfter.includes(invariant), true, `composition must preserve sizing invariant: ${invariant}`);
  }

  const provisionShell = spawnSync('bash', ['-n', provisionTarget], { encoding: 'utf8' });
  assert.equal(provisionShell.status, 0, provisionShell.stderr || provisionShell.stdout);
  const campaignShell = spawnSync('bash', ['-n', campaignTarget], { encoding: 'utf8' });
  assert.equal(campaignShell.status, 0, campaignShell.stderr || campaignShell.stdout);

  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-composed-heal-evidence.py', provisionTarget, campaignTarget], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'composed patch must fail closed when applied twice');
});
