import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const workflowPath = path.join(ROOT, '.github/workflows/production-public-http-probe.yml');
const bicepPath = path.join(ROOT, 'infra/production-observability/public-http-probe.bicep');
const contractPath = path.join(ROOT, 'operations/production-public-http-probe.json');
const alertsPath = path.join(ROOT, 'observability/prometheus/slo-alerts.yml');

const read = (file) => readFile(file, 'utf8');

test('Sprint 19 defines the canonical public relay probe job at exactly one minute', async () => {
  const [bicep, contractRaw] = await Promise.all([read(bicepPath), read(contractPath)]);
  const contract = JSON.parse(contractRaw);

  assert.equal(contract.jobName, 'truyn-relay-public');
  assert.equal(contract.target, 'https://relay.truyn.org/health');
  assert.equal(contract.interval, '1m');
  assert.equal(contract.timeout, '20s');

  assert.match(bicep, /job_name: truyn-relay-public/);
  assert.match(bicep, /scrape_interval: 1m/);
  assert.match(bicep, /scrape_timeout: 20s/);
  assert.doesNotMatch(bicep, /scrape_interval:\s*(?:[2-9]m|[1-9][0-9]+m|[2-9][0-9]s)/);
});

test('public probe exercises the canonical Cloudflare edge rather than loopback relay health', async () => {
  const [bicep, contractRaw] = await Promise.all([read(bicepPath), read(contractPath)]);
  const contract = JSON.parse(contractRaw);

  assert.equal(contract.pathClass, 'public-edge');
  assert.equal(contract.expected.httpStatus, 200);
  assert.equal(contract.expected.requiredResponseHeader, 'CF-Ray');
  assert.ok(bicep.includes('https://relay.truyn.org/health'));
  assert.match(bicep, /response\.headers\.get\('CF-Ray'\)/);
  assert.match(bicep, /success = 1 if status_code == 200 and cf_ray == 1 else 0/);
});

test('probe samples are remote-written to the private production metrics backend', async () => {
  const bicep = await read(bicepPath);
  assert.match(bicep, /prometheusremotewrite:/);
  assert.match(bicep, /endpoint: "\$\{backendWriteUrl\}"/);
  assert.match(bicep, /metrics:\n\s+receivers: \[prometheus\]\n\s+exporters: \[prometheusremotewrite\]/);
  assert.match(bicep, /127\.0\.0\.1:9115/);
});

test('live acceptance requires two fresh successful one-minute samples', async () => {
  const [bicep, workflow, contractRaw] = await Promise.all([
    read(bicepPath),
    read(workflowPath),
    read(contractPath)
  ]);
  const contract = JSON.parse(contractRaw);

  assert.ok(contract.liveAcceptance.minimumFreshSamples >= 2);
  assert.match(bicep, /len\(success_values\) >= 2/);
  assert.match(bicep, /all\(value == 1\.0 for value in success_values\[-2:\]\)/);
  assert.match(bicep, /all\(value == 200\.0 for value in status_values\[-2:\]\)/);
  assert.match(bicep, /all\(value == 1\.0 for value in edge_values\[-2:\]\)/);
  assert.match(workflow, /TRUYN_PUBLIC_HTTP_PROBE_PASS job=truyn-relay-public interval=1m http=200 cf_ray=1 samples=2plus/);
});

test('existing SLO alerting consumes the same canonical probe job', async () => {
  const alerts = await read(alertsPath);
  assert.match(alerts, /probe_success\{job="truyn-relay-public"\}/);
  assert.match(alerts, /TruynPublicAvailabilityProbeFastBurn/);
});

test('Sprint 19 deployment is main-only and emits sanitized exact-main evidence', async () => {
  const workflow = await read(workflowPath);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /azure\/login@v2/);
  assert.match(workflow, /sourceSha="\$GITHUB_SHA"/);
  assert.match(workflow, /exactMain: true/);
  assert.match(workflow, /retention-days: 30/);

  const marker = 'schema: "truyn.production-public-http-probe-evidence/v1"';
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, 'sanitized Sprint 19 evidence block is missing');
  const end = workflow.indexOf("' > production-public-http-probe-evidence.json", start);
  assert.ok(end > start, 'sanitized evidence block terminator is missing');
  const block = workflow.slice(start, end);
  for (const forbidden of [
    'ACA_ENVIRONMENT_ID',
    'BACKEND_APP',
    'PROBE_APP',
    'BACKEND_WRITE_URL',
    'BACKEND_QUERY_BASE'
  ]) {
    assert.equal(block.includes(forbidden), false, `${forbidden} leaked into public evidence`);
  }
});
