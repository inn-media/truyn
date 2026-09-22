import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Class-D remote retries a transient az failure despite inherited ERR trap', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-remote-errtrace-'));
  try {
    const provision = await readFile('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');
    const remoteFn = provision.match(/^remote\(\) \{[\s\S]*?^\}/m)?.[0];
    assert.ok(remoteFn);
    await writeFile(join(dir, 'az'), '#!/usr/bin/env bash\nif [[ ! -f "$STATE/failed" ]]; then touch "$STATE/failed"; echo Conflict >&2; exit 1; fi\necho OK_MARKER=1\n');
    await chmod(join(dir, 'az'), 0o755);
    const script = `${remoteFn}\nsleep() { :; }\nRG=rg\n(\n trap 'exit 97' ERR\n set -Eeuo pipefail\n (remote vm-h0 true >"${dir}/out") &\n wait $! || { echo KILLED; exit 1; }\n grep -q OK_MARKER=1 "${dir}/out"\n echo STAGE_OK\n)\n`;
    const run = spawnSync('bash', ['-c', script], { encoding: 'utf8', env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, STATE: dir } });
    assert.match(run.stdout, /STAGE_OK/, `stdout=${run.stdout} stderr=${run.stderr}`);
    assert.doesNotMatch(run.stdout, /KILLED/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
