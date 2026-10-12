import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const bicepUrl = new URL('../infra/production-observability/metrics-collector.bicep', import.meta.url);

function exporterBlock(bicep) {
  const template = bicep.match(/var collectorConfigTemplate = '''\n([\s\S]*?)\n'''/);
  assert.ok(template, 'expected one embedded collector configuration');
  const block = template[1].match(/\nexporters:\n  prometheusremotewrite:\n([\s\S]*?)\nservice:/);
  assert.ok(block, 'Prometheus remote-write exporter must remain configured');
  return block[1];
}

function assertSupportedQueue(block) {
  assert.doesNotMatch(block, /^\s+sending_queue:/m,
    'pinned Prometheus remote-write exporter rejects sending_queue');
  assert.match(block, /^    remote_write_queue:\n      enabled: true$/m);
  assert.match(block, /^    retry_on_failure:\n      enabled: true$/m);
}

test('production Prometheus exporter uses its supported remote_write_queue', async () => {
  const bicep = await readFile(bicepUrl, 'utf8');
  assertSupportedQueue(exporterBlock(bicep));
  assert.match(bicep, /param collectorVersion string = '0\.158\.0'/);
  assert.match(bicep, /TRUYN_METRICS_COLLECTOR_PASS http=1 dispatch=1 result=1 ready=1 loopback=1 remote_write=1 identity=1 forbidden=0/);
  assert.match(bicep, /if not all\(seen\):/);
  assert.match(bicep, /any\(label in labels for label in FORBIDDEN_LABELS\)/);
  assert.match(bicep, /float\(item\.get\('value', \[0, 0\]\)\[1\]\) == 1\.0/);
});

test('regression reproduces rejection of the former production queue key', async () => {
  const current = exporterBlock(await readFile(bicepUrl, 'utf8'));
  const broken = current.replace('remote_write_queue:', 'sending_queue:');
  assert.notEqual(broken, current);
  assert.throws(() => assertSupportedQueue(broken), /rejects sending_queue/);
});
