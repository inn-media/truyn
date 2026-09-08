import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const BICEP = new URL('../infra/production-tracing/trace-backend.bicep', import.meta.url);
const TEMPO_CONFIG = new URL('../infra/production-tracing/tempo/tempo.yaml', import.meta.url);
const DOCKERFILE = new URL('../infra/production-tracing/tempo/Dockerfile', import.meta.url);
const CONTRACT = new URL('../operations/production-trace-backend.json', import.meta.url);
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

test('trace backend Bicep keeps storage and ingress private and uses managed identity', async () => {
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
  assert.match(bicep, /TRUYN_TRACE_CANARY_PASS otlp_http=accepted trace_readback=observed storage=azure-blob/);
  assert.doesNotMatch(bicep, /storage_account_key/i);
});

test('trace backend workflow validates on PR and applies only from exact main', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /az bicep build --file infra\/production-tracing\/trace-backend\.bicep/);
  assert.match(workflow, /docker build --pull --tag truyn-trace-backend:validate/);
  assert.match(workflow, /az acr build/);
  assert.match(workflow, /truyn-trace-backend:\$\{GITHUB_SHA\}/);
  assert.match(workflow, /sourceSha="\$GITHUB_SHA"/);
  assert.match(workflow, /Prove OTLP endpoint and trace read-back/);
  assert.match(workflow, /TRUYN_TRACE_CANARY_PASS otlp_http=accepted trace_readback=observed storage=azure-blob/);
  assert.match(workflow, /production-trace-backend-evidence\.json/);
  assert.match(workflow, /otlpEndpointAccepted: true/);
  assert.match(workflow, /traceReadBackObserved: true/);
  assert.match(workflow, /status: "PASS"/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});
