import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const workflowPath = path.join(ROOT, '.github/workflows/production-metrics-backend.yml');
const bicepPath = path.join(ROOT, 'infra/production-observability/metrics-backend.bicep');
const contractPath = path.join(ROOT, 'operations/production-metrics-backend.json');

const read = (file) => readFile(file, 'utf8');

test('production metrics backend is VictoriaMetrics on the private Container Apps plane', async () => {
  const [bicep, contractRaw] = await Promise.all([read(bicepPath), read(contractPath)]);
  const contract = JSON.parse(contractRaw);
  assert.match(bicep, /Microsoft\.App\/containerApps@2025-07-01/);
  assert.match(bicep, /victoriametrics\/victoria-metrics:\$\{victoriaMetricsVersion\}/);
  assert.match(bicep, /v1\.151\.0/);
  assert.doesNotMatch(bicep, /external:\s*true/);
  assert.equal(contract.backendId, 'prod-prometheus-01');
  assert.equal(contract.backendClass, 'azure-container-apps-victoriametrics');
  assert.equal(contract.backendVersion, 'v1.151.0');
  assert.equal(contract.prometheusCompatible, true);
  assert.equal(contract.publicIngress, false);
  assert.equal(contract.seriesAcceptanceMetric, 'truyn_backend_acceptance_series');
  assert.equal(contract.liveSeriesAccepted, false);
});

test('live backend mutation is main-only and reuses an accepted internal production environment', async () => {
  const workflow = await read(workflowPath);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.doesNotMatch(workflow, /branches:\s*\[[^\]]*ops\//);
  assert.match(workflow, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /azure\/login@v2/);
  assert.match(workflow, /\.properties\.vnetConfiguration\.internal == true/);
  assert.match(workflow, /publicNetworkAccess \| ascii_downcase/);
  assert.match(workflow, /No accepted internal production Container Apps foundation is available/);
  assert.doesNotMatch(workflow, /Microsoft\.Monitor\/register\/action/);
});

test('acceptance requires actual Prometheus remote-write plus independent PromQL read-back', async () => {
  const [workflow, bicep] = await Promise.all([read(workflowPath), read(bicepPath)]);
  assert.match(bicep, /http:\/\/127\.0\.0\.1:8428\/api\/v1\/write/);
  assert.match(bicep, /http:\/\/127\.0\.0\.1:8428\/api\/v1\/query/);
  assert.match(bicep, /Content-Encoding': 'snappy/);
  assert.match(bicep, /Content-Type': 'application\/x-protobuf/);
  assert.match(bicep, /X-Prometheus-Remote-Write-Version': '0\.1\.0/);
  assert.match(bicep, /truyn_backend_acceptance_series/);
  assert.match(bicep, /TRUYN_METRICS_CANARY_PASS remote_write=accepted promql=observed/);
  assert.match(workflow, /TRUYN_METRICS_CANARY_PASS remote_write=accepted promql=observed/);
  assert.match(workflow, /remoteWriteAccepted: true/);
  assert.match(workflow, /promqlReadBackObserved: true/);
  assert.match(workflow, /status: "PASS"/);
});

test('backend has no public ingress and acceptance probe remains inside the same replica', async () => {
  const bicep = await read(bicepPath);
  assert.match(bicep, /name: 'victoriametrics'/);
  assert.match(bicep, /name: 'acceptance-probe'/);
  assert.match(bicep, /127\.0\.0\.1:8428/);
  assert.doesNotMatch(bicep, /ingress:\s*\{[\s\S]*external:\s*true/);
});

test('public acceptance artifact contains no private Azure topology or resource identity', async () => {
  const workflow = await read(workflowPath);
  const marker = "schema: \"truyn.production-metrics-backend-evidence/v1\"";
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, 'sanitized evidence block is missing');
  const end = workflow.indexOf("' > production-metrics-backend-evidence.json", start);
  assert.ok(end > start, 'sanitized evidence block terminator is missing');
  const evidenceBlock = workflow.slice(start, end);
  for (const forbidden of ['METRICS_APP', 'ACA_ENVIRONMENT', 'ACA_ENVIRONMENT_ID', 'RESOURCE_GROUP']) {
    assert.equal(evidenceBlock.includes(forbidden), false, `${forbidden} leaked into public evidence block`);
  }
});
