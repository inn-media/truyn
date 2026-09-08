import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const workflowPath = path.join(ROOT, '.github/workflows/production-metrics-collector.yml');
const collectorBicepPath = path.join(ROOT, 'infra/production-observability/metrics-collector.bicep');
const backendBicepPath = path.join(ROOT, 'infra/production-observability/metrics-backend.bicep');
const contractPath = path.join(ROOT, 'operations/production-metrics-collector.json');
const dockerfilePath = path.join(ROOT, 'Dockerfile');

const read = (file) => readFile(file, 'utf8');

test('relay metrics listener remains loopback-only', async () => {
  const [collectorBicep, contractRaw, dockerfile] = await Promise.all([
    read(collectorBicepPath),
    read(contractPath),
    read(dockerfilePath)
  ]);
  const contract = JSON.parse(contractRaw);
  assert.equal(contract.metricsListener.host, '127.0.0.1');
  assert.equal(contract.metricsListener.port, 9464);
  assert.equal(contract.metricsListener.path, '/metrics');
  assert.equal(contract.metricsListener.loopbackOnly, true);
  assert.equal(contract.metricsListener.publicIngress, false);
  assert.match(collectorBicep, /TRUYN_METRICS_HOST', value: '127\.0\.0\.1'/);
  assert.match(collectorBicep, /TRUYN_METRICS_PORT', value: '9464'/);
  assert.match(collectorBicep, /targets: \["127\.0\.0\.1:9464"\]/);
  assert.doesNotMatch(collectorBicep, /0\.0\.0\.0:9464/);
  assert.match(dockerfile, /TRUYN_METRICS_HOST=127\.0\.0\.1/);
});

test('collector is a pinned node-local OpenTelemetry sidecar using Prometheus remote-write', async () => {
  const [collectorBicep, contractRaw] = await Promise.all([read(collectorBicepPath), read(contractPath)]);
  const contract = JSON.parse(contractRaw);
  assert.equal(contract.collectorClass, 'opentelemetry-collector-contrib-sidecar');
  assert.equal(contract.collectorVersion, '0.158.0');
  assert.match(collectorBicep, /otel\/opentelemetry-collector-contrib:\$\{collectorVersion\}/);
  assert.match(collectorBicep, /--config=env:OTEL_CONFIG/);
  assert.match(collectorBicep, /receivers:\n  prometheus:/);
  assert.match(collectorBicep, /exporters:\n  prometheusremotewrite:/);
  assert.match(collectorBicep, /endpoint: "\$\{backendWriteUrl\}"/);
});

test('metrics backend is private but internally reachable by collectors', async () => {
  const backendBicep = await read(backendBicepPath);
  assert.match(backendBicep, /ingress:\s*\{[\s\S]*external: false[\s\S]*targetPort: 8428/);
  assert.doesNotMatch(backendBicep, /external: true/);
});

test('live deployment is exact-main only and builds the relay from the accepted source SHA', async () => {
  const workflow = await read(workflowPath);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /azure\/login@v2/);
  assert.match(workflow, /az acr build/);
  assert.match(workflow, /relay_tag="truyn-relay:\$\{GITHUB_SHA\}"/);
  assert.match(workflow, /sourceSha="\$GITHUB_SHA"/);
});

test('Sprint 7 acceptance requires all four relay metric families in the backend', async () => {
  const [collectorBicep, workflow, contractRaw] = await Promise.all([
    read(collectorBicepPath),
    read(workflowPath),
    read(contractPath)
  ]);
  const contract = JSON.parse(contractRaw);
  assert.deepEqual(contract.requiredMetrics, [
    'truyn_http_requests_total',
    'truyn_dispatch_attempts_total',
    'truyn_result_delivery_total',
    'truyn_runtime_ready'
  ]);
  for (const metric of contract.requiredMetrics) {
    assert.match(collectorBicep, new RegExp(metric));
    assert.match(workflow, new RegExp(metric));
  }
  assert.match(collectorBicep, /truyn_runtime_ready\{role="relay"/);
  assert.match(collectorBicep, /TRUYN_METRICS_COLLECTOR_PASS http=1 dispatch=1 result=1 ready=1 loopback=1 remote_write=1/);
  assert.match(workflow, /status: "PASS"/);
});

test('Sprint 8 collection layer adds bounded production identity labels and rejects request identity labels', async () => {
  const [collectorBicep, contractRaw] = await Promise.all([read(collectorBicepPath), read(contractPath)]);
  const contract = JSON.parse(contractRaw);

  assert.deepEqual(contract.seriesIdentityLabels, {
    environment: 'production',
    deployment: 'dc4518de-d1bf-4fce-b351-e43d7c152999',
    service: 'truyn-relay',
    regionValues: ['region-9f2d7c41', 'region-4b81a6e3']
  });
  assert.deepEqual(contract.forbiddenMetricLabels, ['requestId', 'providerId', 'nodeId']);

  const configStart = collectorBicep.indexOf("var collectorConfig = '''");
  const configEnd = collectorBicep.indexOf("var acceptanceScript = '''", configStart);
  assert.ok(configStart >= 0 && configEnd > configStart, 'collector config block is missing');
  const collectorConfig = collectorBicep.slice(configStart, configEnd);

  assert.match(collectorConfig, /environment: "production"/);
  assert.match(collectorConfig, /deployment: "\$\{deploymentId\}"/);
  assert.match(collectorConfig, /service: "truyn-relay"/);
  assert.match(collectorConfig, /region: "\$\{regionIdentity\}"/);
  assert.match(collectorBicep, /germanywestcentral: 'region-9f2d7c41'/);
  assert.match(collectorBicep, /northeurope: 'region-4b81a6e3'/);

  for (const forbidden of contract.forbiddenMetricLabels) {
    assert.equal(collectorConfig.includes(forbidden), false, `${forbidden} must not be injected by the collection layer`);
  }

  assert.match(collectorBicep, /FORBIDDEN_LABELS = \{'requestId', 'providerId', 'nodeId'\}/);
  assert.match(collectorBicep, /any\(label in labels for label in FORBIDDEN_LABELS\)/);
  assert.match(collectorBicep, /identity=1 forbidden=0/);
});

test('sanitized public evidence contains no private Azure topology', async () => {
  const workflow = await read(workflowPath);
  const marker = 'schema: "truyn.production-metrics-collector-evidence/v1"';
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, 'sanitized evidence block is missing');
  const end = workflow.indexOf("' > production-metrics-collector-evidence.json", start);
  assert.ok(end > start, 'sanitized evidence block terminator is missing');
  const block = workflow.slice(start, end);
  for (const forbidden of [
    'ACA_ENVIRONMENT_ID',
    'REGISTRY_NAME',
    'BACKEND_APP',
    'COLLECTOR_APP',
    'BACKEND_WRITE_URL',
    'BACKEND_QUERY_URL',
    'RELAY_IMAGE'
  ]) {
    assert.equal(block.includes(forbidden), false, `${forbidden} leaked into public evidence block`);
  }
});