import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 diagnostic patch parallelizes only host bootstrap orchestration', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-bootstrap-parallel-'));
  const target = join(dir, 'provision.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-provision.sh', target);
  const before = await readFile(target, 'utf8');

  const run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-bootstrap-parallel.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const after = await readFile(target, 'utf8');

  assert.match(after, /bootstrap_dir=\$\(mktemp -d\)/);
  assert.match(after, /bootstrap_pids=\(\)/);
  assert.match(after, /bootstrap_pids\+=\("\$!"\)/);
  assert.match(after, /for pid in "\$\{bootstrap_pids\[@\]\}"; do wait "\$pid"; done/);
  assert.match(after, /for i in \$\(seq 0 \$\(\(HOST_COUNT-1\)\)\); do cat "\$bootstrap_dir\/\$i"; done/);

  assert.equal(after.includes('BOOTSTRAP_MAX_PEERS_PER_NODE=32'), before.includes('BOOTSTRAP_MAX_PEERS_PER_NODE=32'));
  assert.equal(after.includes('STRICT_NODES_PER_HOST=50'), true);

  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-bootstrap-parallel.py', target], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'patch must fail closed when applied twice');
});
