import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const overridesUrl = new URL('../infra/production-tracing/tempo/overrides.yaml', import.meta.url);

function verifyOverrides(source) {
  const blocks = source.split(/^  (?=normal:|incident:)/m).slice(1);
  assert.equal(blocks.length, 2, 'both named retention tenants are mandatory');
  const names = new Set();
  for (const block of blocks) {
    const name = block.split(':', 1)[0];
    assert.ok(['normal', 'incident'].includes(name));
    assert.ok(!names.has(name), 'duplicate tenant');
    names.add(name);
    assert.match(block, /^    ingestion:\n      rate_limit_bytes: 1048576\n      burst_size_bytes: 2097152\n      max_traces_per_user: 10000$/m,
      'each tenant must explicitly restore bounded nonzero ingestion; defaults are not inherited');
    assert.match(block, /^    global:\n      max_bytes_per_trace: 5000000$/m,
      'per-trace size protection must remain active');
    const retention = name === 'normal' ? '720h' : '2160h';
    assert.ok(block.includes('      block_retention: ' + retention + '\n'));
    assert.match(block, /^      compaction_window: 1h$/m);
    assert.match(block, /^      compaction_disabled: false$/m);
    for (const key of ['rate_limit_bytes', 'burst_size_bytes', 'max_traces_per_user', 'max_bytes_per_trace', 'block_retention']) {
      assert.equal(block.split(key + ':').length - 1, 1, 'one value for ' + key);
    }
  }
  assert.deepEqual([...names].sort(), ['incident', 'normal']);
}

test('both Tempo retention tenants have bounded nonzero ingestion and unchanged retention', async () => {
  verifyOverrides(await readFile(overridesUrl, 'utf8'));
});

test('former compaction-only overrides and explicit zero ingress fail regression', async () => {
  const current = await readFile(overridesUrl, 'utf8');
  const omitted = current.replaceAll('    ingestion:\n      rate_limit_bytes: 1048576\n      burst_size_bytes: 2097152\n      max_traces_per_user: 10000\n', '');
  assert.notEqual(omitted, current);
  assert.throws(() => verifyOverrides(omitted), /nonzero ingestion/);
  const zero = current.replace('rate_limit_bytes: 1048576', 'rate_limit_bytes: 0');
  assert.throws(() => verifyOverrides(zero), /nonzero ingestion/);
  const unlimitedTrace = current.replace('max_bytes_per_trace: 5000000', 'max_bytes_per_trace: 0');
  assert.throws(() => verifyOverrides(unlimitedTrace), /size protection/);
});
