import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('A20 Azure remote execution is bounded and a timeout is never retried', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-a20-remote-'));
  try {
    const provision = await readFile('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');
    const remoteFn = provision.match(/^remote\(\) \{[\s\S]*?^\}/m)?.[0];
    assert.ok(remoteFn);
    assert.match(remoteFn, /timeout -k 20 \$\{host_budget\} \/bin\/bash \/tmp\/truyn-d1000-run\.sh/);

    await writeFile(join(dir, 'az'), '#!/usr/bin/env bash\necho call >>"$STATE/calls"\nsleep 30\n');
    await chmod(join(dir, 'az'), 0o755);
    const script = `${remoteFn}
RG=rg
set +e
remote vm-h0 'true' 2 >"${dir}/out" 2>"${dir}/err"
echo RC=$?
`;
    const started = Date.now();
    const run = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, STATE: dir }
    });
    assert.match(run.stdout, /RC=124/, `stdout=${run.stdout} stderr=${run.stderr}`);
    assert.ok(Date.now() - started < 20_000);
    assert.match(await readFile(join(dir, 'err'), 'utf8'), /TRUYN_REMOTE_TIMEOUT vm=vm-h0 budgetSec=2/);
    assert.match(await readFile(join(dir, 'out'), 'utf8'), /TRUYN_REMOTE_TIMEOUT=2/);
    assert.equal((await readFile(join(dir, 'calls'), 'utf8')).trim().split('\n').length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('A20 harness keeps D-500 acceptance and infrastructure sizing unchanged', async () => {
  const campaign = await readFile('benchmarks/scale/class-d-azure-1000-campaign.sh', 'utf8');
  const provision = await readFile('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');

  assert.match(campaign, /STAGE=durable-writes\nREMOTE_STAGE_BUDGET_SECONDS=720/);
  assert.match(campaign, /STAGE=restart-recovery\nREMOTE_STAGE_BUDGET_SECONDS=1320/);
  assert.match(campaign, /--max-time 45 -o "\\?\$f"/);
  assert.match(campaign, /\[\[ "\\?\$code" == 200 && "\\?\$a" -ge 2 \]\]/);
  assert.match(campaign, /assert float\('\$conv_rate'\) >= \.99/);

  assert.match(provision, /TRUYN_DHT_RPC_TIMEOUT_MS=5000/);
  assert.match(provision, /TRUYN_DHT_WRITE_QUORUM=2/);
  assert.match(provision, /TRUYN_DISCOVERY_REFRESH_INTERVAL_MS=15000/);
  assert.match(provision, /collect_liveness_evidence "\$failed_stage"/);
  assert.match(provision, /D500_STAGE_DEADLINE_SECONDS/);

  // A20 deliberately does not hide runtime pressure by changing infrastructure yet.
  assert.doesNotMatch(provision, /--storage-sku Premium_LRS/);
  assert.doesNotMatch(provision, /Slice=truyn-d1000\.slice/);
});
