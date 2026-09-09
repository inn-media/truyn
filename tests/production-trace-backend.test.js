import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const BICEP = new URL('../infra/production-tracing/trace-backend.bicep', import.meta.url);
const TEMPO_CONFIG = new URL('../infra/production-tracing/tempo/tempo.yaml', import.meta.url);
const DOCKERFILE = new URL('../infra/production-tracing/tempo/Dockerfile', import.meta.url);
const CONTRACT = new URL('../operations/production-trace-backend.json', import.meta.url);
const EXPORT_CONTRACT = new URL('../operations/production-trace-export.json', import.meta.url);
const CANARY = new URL('../runtime/trace-export-canary.js', import.meta.url);
const WORKFLOW = new URL('../.github/workflows/production-trace-backend.yml', import.meta.url);

test('production trace backend contract is private OTLP storage', async () => {
  const contract = JSON.parse(await readFile(CONTRACT, 'utf8'));
  assert.equal(contract.schema, 'truyn.production-trace-backend/v1');
  assert.equal(contract.backendId, 'prod-traces-01');
  assert.equal(contract.deploymentId, 'dc4518de-d1bf-4fce-b351-e43d7c152999');
  assert.equal(contract.backendClass, 'azure-container-apps-tempo');
  assert.equal(contract.backendVersion, '3.0.2');
  assert.deepEqual(contract.protocols.otlpHttp, { enabled: true, port: 4318, path: '/v1/traces' });
  assert.deepEqual(contract.protocols.otlpGrpc, { enabled: true, port: 4317 });
  assert.equal(contract.storage.backend, 'azure-blob');
  assert.equal(contract.storage.authentication, 'managed-identity');
  assert.equal(contract.storage.publicNetworkAccess, false);
  assert.equal(contract.storage.privateEndpointRequired, true);
  assert.equal(contract.storage.sharedKeyAccess, false);
  assert.equal(contract.publicIngress, false);
  assert.equal(contract.acceptance.otlpHttpMustAcceptTrace, true);
  assert.equal(contract.acceptance.traceReadBackRequired, true);
  assert.match(contract.acceptance.marker, /TRUYN_TRACE_CANARY_PASS/);
});

test('production trace export contract binds exact-main provider runtime to private OTLP', async () => {
  const contract = JSON.parse(await readFile(EXPORT_CONTRACT, 'utf8'));
  assert.equal(contract.schema, 'truyn.production-trace-export/v1');
  assert.equal(contract.exportId, 'prod-trace-export-01');
  assert.equal(contract.deploymentId, 'dc4518de-d1bf-4fce-b351-e43d7c152999');
  assert.equal(contract.environmentClass, 'production');
  assert.equal(contract.runtimeRole, 'provider');
  assert.equal(contract.runtimeImageBinding, 'exact-main-source-sha');
  assert.equal(contract.environmentVariable, 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT');
  assert.equal(contract.protocol, 'otlp/http-protobuf');
  assert.equal(contract.endpointScope, 'private-loopback-sidecar');
  assert.equal(contract.endpointPath, '/v1/traces');
  assert.equal(contract.publicEndpoint, false);
  assert.equal(contract.acceptance.spanName, 'truyn.provider.execute');
  assert.equal(contract.acceptance.exactTraceReadBackRequired, true);
  assert.equal(contract.acceptance.sourceShaBindingRequired, true);
  assert.match(contract.acceptance.marker, /TRUYN_TRACE_EXPORT_PASS/);
});

test('Tempo image is pinned and exposes OTLP receivers with Azure object storage', async () => {
  const dockerfile = await readFile(DOCKERFILE, 'utf8');
  const config = await readFile(TEMPO_CONFIG, 'utf8');
  assert.match(dockerfile, /^FROM grafana\/tempo:3\.0\.2$/m);
  assert.match(dockerfile, /-config\.file=\/etc\/tempo\/tempo\.yaml/);
  assert.match(dockerfile, /-config\.expand-env=true/);
  assert.match(config, /grpc:\n\s+endpoint: "0\.0\.0\.0:4317"/);
  assert.match(config, /http:\n\s+endpoint: "0\.0\.0\.0:4318"/);
  assert.match(config, /backend: azure/);
  assert.match(config, /container_name: \$\{TEMPO_STORAGE_CONTAINER\}/);
  assert.match(config, /storage_account_name: \$\{AZURE_STORAGE_ACCOUNT\}/);
  assert.match(config, /use_managed_identity: true/);
  assert.match(config, /user_assigned_id: \$\{AZURE_CLIENT_ID\}/);
});

test('trace backend Bicep keeps storage private and injects OTLP trace export into production runtime', async () => {
  const bicep = await readFile(BICEP, 'utf8');
  assert.match(bicep, /Microsoft\.Storage\/storageAccounts@2023-05-01/);
  assert.match(bicep, /allowSharedKeyAccess: false/);
  assert.match(bicep, /defaultToOAuthAuthentication: true/);
  assert.match(bicep, /publicNetworkAccess: 'Disabled'/);
  assert.match(bicep, /supportsHttpsTrafficOnly: true/);
  assert.match(bicep, /Microsoft\.ManagedIdentity\/userAssignedIdentities/);
  assert.match(bicep, /ba92f5b4-2d11-453d-a403-e96b0029c9fe/);
  assert.match(bicep, /Microsoft\.Network\/privateEndpoints/);
  assert.match(bicep, /privatelink\.blob\.core\.windows\.net/);
  assert.match(bicep, /external: false/);
  assert.match(bicep, /targetPort: 4318/);
  assert.match(bicep, /name: 'runtime-trace-canary'/);
  assert.match(bicep, /name: 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', value: 'http:\/\/127\.0\.0\.1:4318\/v1\/traces'/);
  assert.match(bicep, /name: 'TRUYN_VERSION', value: sourceSha/);
  assert.match(bicep, /TRUYN_TRACE_CANARY_PASS otlp_http=accepted trace_readback=observed storage=azure-blob/);
  assert.match(bicep, /TRUYN_TRACE_EXPORT_PASS span=truyn\.provider\.execute runtime=production source=exact-main/);
  assert.doesNotMatch(bicep, /storage_account_key/i);
});

test('production runtime canary waits for Tempo before SDK start, emits real provider span, and exposes only loopback proof', async () => {
  const canary = await readFile(CANARY, 'utf8');
  assert.match(canary, /http:\/\/127\.0\.0\.1:3200\/ready/);
  assert.match(canary, /async function waitForTempoReady\(\)/);
  assert.match(canary, /response\.status === 200/);
  assert.match(canary, /Tempo readiness timed out before production runtime trace export/);
  const readyIndex = canary.indexOf('await waitForTempoReady();');
  const sdkIndex = canary.indexOf('await startProductionObservability({ role })');
  assert.ok(readyIndex >= 0, 'Tempo readiness gate must execute');
  assert.ok(sdkIndex > readyIndex, 'OpenTelemetry SDK must start only after Tempo readiness');
  assert.match(canary, /getObservabilityPlane/);
  assert.match(canary, /wrapProviderAdapter/);
  assert.match(canary, /trace\.getActiveSpan\(\)\?\.spanContext\(\)\?\.traceId/);
  assert.match(canary, /OTEL_EXPORTER_OTLP_TRACES_ENDPOINT/);
  assert.match(canary, /http:\/\/127\.0\.0\.1:4318\/v1\/traces/);
  assert.match(canary, /await telemetry\.shutdown\(\)/);
  assert.match(canary, /span: 'truyn\.provider\.execute'/);
  assert.match(canary, /server\.listen\(9466, '127\.0\.0\.1'/);
  assert.doesNotMatch(canary, /0\.0\.0\.0.*9466/);
});

test('trace backend workflow validates on PR and applies exact-main runtime trace export on main', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /az bicep build --file infra\/production-tracing\/trace-backend\.bicep/);
  assert.match(workflow, /docker build --pull --tag truyn-trace-backend:validate/);
  assert.match(workflow, /node --check runtime\/trace-export-canary\.js/);
  assert.match(workflow, /az acr build/);
  assert.match(workflow, /truyn-trace-backend:\$\{GITHUB_SHA\}/);
  assert.match(workflow, /truyn-runtime:\$\{GITHUB_SHA\}/);
  assert.match(workflow, /runtimeImage="\$TRACE_RUNTIME_IMAGE"/);
  assert.match(workflow, /sourceSha="\$GITHUB_SHA"/);
  assert.match(workflow, /OTEL_EXPORTER_OTLP_TRACES_ENDPOINT/);
  assert.match(workflow, /http:\/\/127\.0\.0\.1:4318\/v1\/traces/);
  assert.match(workflow, /Prove OTLP endpoint and trace read-back/);
  assert.match(workflow, /Prove production runtime trace export/);
  assert.match(workflow, /TRUYN_TRACE_CANARY_PASS otlp_http=accepted trace_readback=observed storage=azure-blob/);
  assert.match(workflow, /TRUYN_TRACE_EXPORT_PASS span=truyn\.provider\.execute runtime=production source=exact-main/);
  assert.match(workflow, /production-trace-export-evidence\.json/);
  assert.match(workflow, /providerSpanObserved: true/);
  assert.match(workflow, /exactTraceReadBackObserved: true/);
  assert.match(workflow, /status: "PASS"/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});
