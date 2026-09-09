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
  assert.equal(contract.syntheticProbeRetentionMetric, 'truyn_synthetic_probe_retention_series');
  assert.equal(contract.liveSeriesAccepted, false);
});

test('Sprint 14 pins SLO-bearing metric retention to 90 days and exceeds the canonical 28-day window', async () => {
  const [workflow, bicep, contractRaw] = await Promise.all([
    read(workflowPath),
    read(bicepPath),
    read(contractPath)
  ]);
  const contract = JSON.parse(contractRaw);

  assert.equal(contract.retention.canonicalSloWindowDays, 28);
  assert.equal(contract.retention.sloBearingSeriesDays, 90);
  assert.equal(contract.retention.runtimePeriod, '90d');
  assert.equal(contract.retention.exceedsCanonicalSloWindow, true);
  assert.ok(contract.retention.sloBearingSeriesDays > contract.retention.canonicalSloWindowDays);

  assert.match(bicep, /param sloMetricsRetentionPeriod string = '90d'/);
  assert.match(bicep, /'-retentionPeriod=\$\{sloMetricsRetentionPeriod\}'/);
  assert.match(workflow, /CANONICAL_SLO_WINDOW_DAYS: '28'/);
  assert.match(workflow, /METRICS_RETENTION_DAYS: '90'/);
  assert.match(workflow, /METRICS_RETENTION_PERIOD: 90d/);
  assert.match(workflow, /sloMetricsRetentionPeriod="\$METRICS_RETENTION_PERIOD"/);
  assert.match(workflow, /\.tags\.retentionPeriod == \$retention/);
  assert.match(workflow, /"-retentionPeriod=" \+ \$retention/);
  assert.match(workflow, /retentionExceedsCanonicalSloWindow: \(\$retentionDays > \$canonicalSloWindowDays\)/);
  assert.match(workflow, /runtimeRetentionArgumentObserved: true/);
});

test('Sprint 15 pins synthetic probe history to 90 days on the same backend and covers the full 28-day gate', async () => {
  const [workflow, bicep, contractRaw] = await Promise.all([
    read(workflowPath),
    read(bicepPath),
    read(contractPath)
  ]);
  const contract = JSON.parse(contractRaw);

  assert.equal(contract.retention.syntheticProbeSeriesDays, 90);
  assert.equal(contract.retention.syntheticProbeRuntimePeriod, '90d');
  assert.equal(contract.retention.probeHistoryCoversCanonicalSloWindow, true);
  assert.equal(contract.retention.syntheticProbeSharesBackendRetention, true);
  assert.ok(contract.retention.syntheticProbeSeriesDays > contract.retention.canonicalSloWindowDays);
  assert.equal(contract.retention.syntheticProbeSeriesDays, contract.retention.sloBearingSeriesDays);

  assert.match(bicep, /truyn_synthetic_probe_retention_series/);
  assert.match(bicep, /\('synthetic', 'true'\)/);
  assert.match(bicep, /\('probe_class', 'availability'\)/);
  assert.match(bicep, /TRUYN_PROBE_RETENTION_CANARY_PASS series=accepted promql=observed retention_class=synthetic-probe/);

  assert.match(workflow, /PROBE_RETENTION_DAYS: '90'/);
  assert.match(workflow, /PROBE_RETENTION_PERIOD: 90d/);
  assert.match(workflow, /\[\[ "\$PROBE_RETENTION_DAYS" -gt "\$CANONICAL_SLO_WINDOW_DAYS" \]\]/);
  assert.match(workflow, /\[\[ "\$PROBE_RETENTION_DAYS" == "\$METRICS_RETENTION_DAYS" \]\]/);
  assert.match(workflow, /TRUYN_PROBE_RETENTION_CANARY_PASS series=accepted promql=observed retention_class=synthetic-probe/);
  assert.match(workflow, /acceptedSyntheticProbeSeries: "truyn_synthetic_probe_retention_series"/);
  assert.match(workflow, /syntheticProbeSeriesAccepted: true/);
  assert.match(workflow, /syntheticProbePromqlReadBackObserved: true/);
  assert.match(workflow, /probeRetentionExceedsCanonicalSloWindow: \(\$probeRetentionDays > \$canonicalSloWindowDays\)/);
  assert.match(workflow, /probeHistoryCoversCanonicalSloWindow: \(\$probeRetentionDays > \$canonicalSloWindowDays\)/);
  assert.match(workflow, /syntheticProbeSharesBackendRetention: \(\$probeRetentionDays == \$retentionDays and \$probeRetentionPeriod == \$retentionPeriod\)/);
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

test('acceptance requires actual Prometheus remote-write plus independent PromQL read-back for backend and synthetic probe series', async () => {
  const [workflow, bicep] = await Promise.all([read(workflowPath), read(bicepPath)]);
  assert.match(bicep, /http:\/\/127\.0\.0\.1:8428\/api\/v1\/write/);
  assert.match(bicep, /http:\/\/127\.0\.0\.1:8428\/api\/v1\/query/);
  assert.match(bicep, /Content-Encoding': 'snappy/);
  assert.match(bicep, /Content-Type': 'application\/x-protobuf/);
  assert.match(bicep, /X-Prometheus-Remote-Write-Version': '0\.1\.0/);
  assert.match(bicep, /truyn_backend_acceptance_series/);
  assert.match(bicep, /truyn_synthetic_probe_retention_series/);
  assert.match(bicep, /TRUYN_METRICS_CANARY_PASS remote_write=accepted promql=observed/);
  assert.match(bicep, /TRUYN_PROBE_RETENTION_CANARY_PASS series=accepted promql=observed retention_class=synthetic-probe/);
  assert.match(workflow, /TRUYN_METRICS_CANARY_PASS remote_write=accepted promql=observed/);
  assert.match(workflow, /TRUYN_PROBE_RETENTION_CANARY_PASS series=accepted promql=observed retention_class=synthetic-probe/);
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
  const marker = "schema: \"truyn.production-metrics-backend-evidence/v3\"";
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, 'sanitized evidence block is missing');
  const end = workflow.indexOf("' > production-metrics-backend-evidence.json", start);
  assert.ok(end > start, 'sanitized evidence block terminator is missing');
  const evidenceBlock = workflow.slice(start, end);
  for (const forbidden of ['METRICS_APP', 'ACA_ENVIRONMENT', 'ACA_ENVIRONMENT_ID', 'RESOURCE_GROUP']) {
    assert.equal(evidenceBlock.includes(forbidden), false, `${forbidden} leaked into public evidence block`);
  }
});
