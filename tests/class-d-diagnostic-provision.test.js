import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const provisionPath = new URL('../benchmarks/scale/class-d-azure-1000-provision.sh', import.meta.url);
const transformerPath = new URL('../scripts/prepare-class-d-diagnostic-provision.py', import.meta.url);

test('diagnostic provision dispatches host bootstrap concurrently without changing bootstrap timeouts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-diagnostic-provision-'));
  const target = join(dir, 'provision.sh');
  try {
    const original = await readFile(provisionPath, 'utf8');
    await writeFile(target, original);
    const run = spawnSync('python3', [transformerPath.pathname, target], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);

    const transformed = await readFile(target, 'utf8');
    assert.match(transformed, /bootstrap_dir=\$\(mktemp -d\)/);
    assert.match(transformed, /bootstrap_pids=\(\)/);
    assert.match(transformed, /\(remote "\$\{VMS\[\$i\]\}" "\$script" >"\$bootstrap_dir\/\$i"\) &/);
    assert.match(transformed, /for pid in "\$\{bootstrap_pids\[@\]\}"; do wait "\$pid"; done/);
    assert.match(transformed, /mode=parallel-hosts plan=per-node-xor refresh=per-node/);
    assert.match(transformed, /curl -fsS --max-time 90 .*\/bootstrap/);
    assert.match(transformed, /curl -fsS --max-time 120 .*\/dht\/refresh/);
    assert.doesNotMatch(transformed, /out=\$\(remote "\$\{VMS\[\$i\]\}" "\$script"\)\n  \[\[ "\$\(marker "\$out" BOOTSTRAP_PLAN_MIN_RECORDS\)"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('diagnostic provision transformer is fail-closed and one-shot', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-diagnostic-provision-'));
  const target = join(dir, 'provision.sh');
  try {
    await writeFile(target, await readFile(provisionPath, 'utf8'));
    const first = spawnSync('python3', [transformerPath.pathname, target], { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const second = spawnSync('python3', [transformerPath.pathname, target], { encoding: 'utf8' });
    assert.notEqual(second.status, 0);
    assert.match(second.stderr + second.stdout, /unexpected bootstrap loop marker count/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
