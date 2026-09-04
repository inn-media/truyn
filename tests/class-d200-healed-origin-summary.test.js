import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function digest(content) {
  return createHash('sha256').update(content).digest('hex');
}

test('D-200 healed summary preserves boolean false and verifies digest', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-healed-summary-'));
  const evidence = join(dir, 'evidence.json');
  const digestPath = join(dir, 'digest.txt');
  const body = `${JSON.stringify({
    schema: 'truyn.d200.healed-reconvergence.v3',
    failureCount: 0,
    classificationCounts: {},
    failures: [],
    evidenceTransport: {
      schema: 'truyn.d200.healed-evidence-transport.v1',
      payloadTruncated: false,
    },
  })}\n`;
  await writeFile(evidence, body);
  await writeFile(digestPath, `sha256:${digest(body)}\n`);

  const run = spawnSync('python3', ['scripts/summarize-class-d200-healed-origin.py', evidence, digestPath], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /^payload_truncated=false$/m);
  assert.match(run.stdout, /^digest_ok=true$/m);
  assert.match(run.stdout, /^failed=0$/m);
});

test('D-200 healed summary preserves boolean true', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-healed-summary-'));
  const evidence = join(dir, 'evidence.json');
  const digestPath = join(dir, 'digest.txt');
  const body = `${JSON.stringify({
    schema: 'truyn.d200.healed-reconvergence.v3',
    failureCount: 1,
    classificationCounts: { 'persistent-after-refresh': 1 },
    failures: [],
    evidenceTransport: {
      schema: 'truyn.d200.healed-evidence-transport.v1',
      payloadTruncated: true,
    },
  })}\n`;
  await writeFile(evidence, body);
  await writeFile(digestPath, `sha256:${digest(body)}\n`);

  const run = spawnSync('python3', ['scripts/summarize-class-d200-healed-origin.py', evidence, digestPath], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /^payload_truncated=true$/m);
  assert.match(run.stdout, /^persistent=1$/m);
});

test('D-200 healed summary fails closed on digest mismatch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-healed-summary-'));
  const evidence = join(dir, 'evidence.json');
  const digestPath = join(dir, 'digest.txt');
  const body = `${JSON.stringify({
    schema: 'truyn.d200.healed-reconvergence.v3',
    failureCount: 0,
    classificationCounts: {},
    failures: [],
    evidenceTransport: {
      schema: 'truyn.d200.healed-evidence-transport.v1',
      payloadTruncated: false,
    },
  })}\n`;
  await writeFile(evidence, body);
  await writeFile(digestPath, `sha256:${'0'.repeat(64)}\n`);

  const run = spawnSync('python3', ['scripts/summarize-class-d200-healed-origin.py', evidence, digestPath], { encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stdout, /^digest_ok=false$/m);
  assert.match(run.stderr, /healed evidence digest mismatch/);
});
