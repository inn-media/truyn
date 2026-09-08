import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const workflowPath = path.join(ROOT, '.github/workflows/production-metrics-backend.yml');
const bicepPath = path.join(ROOT, 'infra/production-observability/metrics-backend.bicep');
const contractPath = path.join(ROOT, 'operations/production-metrics-backend.json');

const read = (file) => readFile(file, 'utf8');

test('production metrics backend is Prometheus-compatible and region-bound', async () => {
  const [bicep, contractRaw] = await Promise.all([read(bicepPath), read(contractPath)]);
  const contract = JSON.parse(contractRaw);
  assert.match(bicep, /Microsoft\.Monitor\/accounts@2023-04-03/);
  assert.match(bicep, /germanywestcentral/);
  assert.equal(contract.backendId, 'prod-prometheus-01');
  assert.equal(contract.backendClass, 'azure-monitor-managed-prometheus');
  assert.equal(contract.prometheusCompatible, true);
  assert.equal(contract.region, 'germanywestcentral');
  assert.equal(contract.seriesAcceptanceMetric, 'truyn_backend_acceptance_series');
  assert.equal(contract.liveSeriesAccepted, false);
});

test('live backend mutation is main-only and uses federated identity', async () => {
  const workflow = await read(workflowPath);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.doesNotMatch(workflow, /branches:\s*\[[^\]]*ops\//);
  assert.match(workflow, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /azure\/login@v2/);
});

test('acceptance requires remote-write plus independent PromQL read-back', async () => {
  const workflow = await read(workflowPath);
  assert.match(workflow, /Content-Encoding: snappy/);
  assert.match(workflow, /application\/x-protobuf/);
  assert.match(workflow, /X-Prometheus-Remote-Write-Version: 0\.1\.0/);
  assert.match(workflow, /streams\/Microsoft-PrometheusMetrics\/api\/v1\/write\?api-version=2023-04-24/);
  assert.match(workflow, /truyn_backend_acceptance_series/);
  assert.match(workflow, /\/api\/v1\/query/);
  assert.match(workflow, /remoteWriteAccepted: true/);
  assert.match(workflow, /promqlReadBackObserved: true/);
  assert.match(workflow, /status: "PASS"/);
});

test('writer and reader permissions are bounded to the metrics surfaces', async () => {
  const workflow = await read(workflowPath);
  assert.match(workflow, /Monitoring Metrics Publisher/);
  assert.match(workflow, /--scope "\$DCR_ID"/);
  assert.match(workflow, /Monitoring Data Reader/);
  assert.match(workflow, /--scope "\$WORKSPACE_ID"/);
});

test('public acceptance artifact contains no private Azure resource identity', async () => {
  const workflow = await read(workflowPath);
  const marker = "schema: \"truyn.production-metrics-backend-evidence/v1\"";
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, 'sanitized evidence block is missing');
  const end = workflow.indexOf("' > production-metrics-backend-evidence.json", start);
  assert.ok(end > start, 'sanitized evidence block terminator is missing');
  const evidenceBlock = workflow.slice(start, end);
  for (const forbidden of ['WORKSPACE_ID', 'DCR_ID', 'WRITE_ENDPOINT', 'QUERY_ENDPOINT', 'WORKSPACE_NAME']) {
    assert.equal(evidenceBlock.includes(forbidden), false, `${forbidden} leaked into public evidence block`);
  }
});
