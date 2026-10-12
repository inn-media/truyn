import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BICEP = new URL('../infra/production-tracing/trace-backend.bicep', import.meta.url);
const TEMPO_CONFIG = new URL('../infra/production-tracing/tempo/tempo.yaml', import.meta.url);
const TEMPO_OVERRIDES = new URL('../infra/production-tracing/tempo/overrides.yaml', import.meta.url);
const DOCKERFILE = new URL('../infra/production-tracing/tempo/Dockerfile', import.meta.url);
const RETENTION_PROBE = new URL('../infra/production-tracing/trace-retention-probe.py', import.meta.url);
const CONTRACT = new URL('../operations/production-trace-backend.json', import.meta.url);
const EXPORT_CONTRACT = new URL('../operations/production-trace-export.json', import.meta.url);
const CANARY = new URL('../runtime/trace-export-canary.js', import.meta.url);
const BOOTSTRAP = new URL('../observability/bootstrap.js', import.meta.url);
const WORKFLOW = new URL('../.github/workflows/production-trace-backend.yml', import.meta.url);

test('production trace backend contract is private OTLP storage with active retention classes', async () => {
  const contract = JSON.parse(await readFile(CONTRACT, 'utf8'));
  assert.equal(contract.schema, 'truyn.production-trace-backend/v2');
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
  assert.equal(contract.retention.mechanism, 'tempo-per-tenant-compaction');
  assert.equal(contract.retention.multitenancyRequired, true);
  assert.equal(contract.retention.tenantHeader, 'X-Scope-OrgID');
  assert.deepEqual(contract.retention.normal, { tenant: 'normal', retentionHours: 720, retentionDays: 30 });
  assert.deepEqual(contract.retention.incident, { tenant: 'incident', retentionHours: 2160, retentionDays: 90 });
  assert.equal(contract.retention.incidentLongerThanNormal, true);
  assert.equal(contract.retention.failClosedRetentionClass, true);
  assert.equal(contract.publicIngress, false);
  assert.equal(contract.acceptance.normalRetentionConfigReadBackRequired, true);
  assert.equal(contract.acceptance.incidentRetentionConfigReadBackRequired, true);
  assert.match(contract.acceptance.marker, /TRUYN_TRACE_RETENTION_PASS/);
});

test('production trace export contract still binds exact-main provider runtime to private OTLP', async () => {
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
});

test('Tempo 3 image pins 30-day normal and 90-day incident retention with mandatory config verification', async () => {
  const [dockerfile, config, overrides] = await Promise.all([
    readFile(DOCKERFILE, 'utf8'),
    readFile(TEMPO_CONFIG, 'utf8'),
    readFile(TEMPO_OVERRIDES, 'utf8')
  ]);
  assert.match(dockerfile, /^FROM grafana\/tempo:3\.0\.2 AS config-verify$/m);
  assert.match(dockerfile, /RUN \["\/tempo", "-config\.file=\/etc\/tempo\/tempo\.yaml", "-config\.expand-env=true", "-config\.verify=true"\]/);
  assert.doesNotMatch(dockerfile, /"-config\.verify"\]/);
  assert.match(dockerfile, /COPY --from=config-verify \/etc\/tempo\/tempo\.yaml \/etc\/tempo\/tempo\.yaml/);
  assert.match(dockerfile, /COPY --from=config-verify \/etc\/tempo\/overrides\.yaml \/etc\/tempo\/overrides\.yaml/);
  assert.match(config, /multitenancy_enabled: true/);
  assert.doesNotMatch(config, /^compactor:/m);
  assert.match(config, /backend_scheduler:[\s\S]*provider:[\s\S]*retention:[\s\S]*interval: 1h/);
  assert.match(config, /backend_scheduler:[\s\S]*compaction:[\s\S]*compaction:[\s\S]*block_retention: 720h/);
  assert.match(config, /backend_worker:[\s\S]*backend_scheduler_addr: "127\.0\.0\.1:9095"/);
  assert.match(config, /backend_worker:[\s\S]*compaction:[\s\S]*block_retention: 720h/);
  assert.match(config, /per_tenant_override_config: \/etc\/tempo\/overrides\.yaml/);
  assert.match(config, /backend: azure/);
  assert.match(overrides, /normal:[\s\S]*block_retention: 720h/);
  assert.match(overrides, /incident:[\s\S]*block_retention: 2160h/);
});

test('trace retention classes are fail-closed in the runtime exporter', async () => {
  const bootstrap = await readFile(BOOTSTRAP, 'utf8');
  assert.match(bootstrap, /TRACE_RETENTION_CLASSES = new Set\(\['normal', 'incident'\]\)/);
  assert.match(bootstrap, /TRUYN_TRACE_RETENTION_CLASS must be normal or incident/);
  assert.match(bootstrap, /headers: \{ 'X-Scope-OrgID': traceRetentionClass \}/);
  assert.match(bootstrap, /'truyn\.trace\.retention_class': traceRetentionClass/);
});

test('trace backend Bicep keeps storage private and consumes shared Blob private DNS without duplicate VNet-link ownership', async () => {
  const bicep = await readFile(BICEP, 'utf8');
  assert.match(bicep, /Microsoft\.Storage\/storageAccounts@2023-05-01/);
  assert.match(bicep, /allowSharedKeyAccess: false/);
  assert.match(bicep, /publicNetworkAccess: 'Disabled'/);
  assert.match(bicep, /Microsoft\.ManagedIdentity\/userAssignedIdentities/);
  assert.match(bicep, /Microsoft\.Network\/privateEndpoints/);
  assert.match(bicep, /resource blobPrivateDns 'Microsoft\.Network\/privateDnsZones@2024-06-01' existing/);
  assert.match(bicep, /name: blobPrivateDnsZoneName/);
  assert.match(bicep, /privateDnsZoneId: blobPrivateDns\.id/);
  assert.doesNotMatch(bicep, /Microsoft\.Network\/privateDnsZones\/virtualNetworkLinks/);
  assert.doesNotMatch(bicep, /guid\(traceStorage\.id, vnetId\)/);
  assert.match(bicep, /sharedBlobPrivateDnsRequired: true/);
  assert.match(bicep, /external: false/);
  assert.match(bicep, /targetPort: 4318/);
  // The embedded Python must be passed as argv, not re-serialized via a shell heredoc.
  assert.ok(bicep.includes("loadTextContent('trace-retention-probe.py')"));
  const probeContainer = bicep.split("name: 'acceptance-probe'")[1] || '';
  assert.ok(probeContainer.includes("'python'"));
  assert.ok(probeContainer.includes("'-c'"));
  assert.ok(probeContainer.includes("probePython"));
  assert.ok(!bicep.includes("cat > /tmp/trace-retention-probe.py"));
  assert.ok(!bicep.includes("probeScript"));
  assert.match(bicep, /name: 'TRUYN_TRACE_RETENTION_CLASS', value: 'normal'/);
  assert.match(bicep, /normalTraceRetentionDays: 30/);
  assert.match(bicep, /incidentTraceRetentionDays: 90/);
  assert.doesNotMatch(bicep, /storage_account_key/i);
});

test('live retention probe proves both tenants, both override values and runtime normal read-back', async () => {
  const probe = await readFile(RETENTION_PROBE, 'utf8');
  assert.match(probe, /'normal':[\s\S]*'retention': '720h'/);
  assert.match(probe, /'incident':[\s\S]*'retention': '2160h'/);
  assert.match(probe, /'X-Scope-OrgID': tenant/);
  assert.match(probe, /\/status\/overrides\/\{tenant\}/);
  // Default-false omission is valid, but explicit true/duplicates must fail closed.
  assert.ok(probe.includes('compaction_fields = re.findall'));
  assert.ok(probe.includes("compaction_fields == ['false']"));
  assert.ok(probe.includes('source == tenant'));
  assert.ok(probe.includes('re.escape(expected)'));
  assert.match(probe, /TRUYN_TRACE_RETENTION_PASS normal_days=30 incident_days=90 normal_readback=1 incident_readback=1/);
  assert.match(probe, /retention_class=normal/);
});


test('Tempo v3.0.2 canonical 30d/90d override read-back is strict and fail-closed', () => {
  // Execute the exact production parser against real Tempo v3 JSON status
  // shape (runtime_overrides is a YAML string, with model.Duration canonical).
  const script = [
    'import ast, json, re, sys',
    'source = open(sys.argv[1], encoding="utf-8").read()',
    'tree = ast.parse(source)',
    'tenant = next(n for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "TENANTS" for t in n.targets))',
    'checker = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "override_observed")',
    'env = {"json": json, "re": re}',
    'exec(compile(ast.Module(body=[tenant, checker], type_ignores=[]), "<probe>", "exec"), env)',
    'def check(tenant_id, source_tenant, retention, compaction=""):',
    '    payload = {"using_default_or_wildcard_runtime_overrides": source_tenant, "runtime_overrides": "compaction:\\n  block_retention: " + retention + "\\n" + compaction}',
    '    env["fetch"] = lambda url, requested_tenant: (200, json.dumps(payload).encode())',
    '    return env["override_observed"](tenant_id)',
    'assert check("normal", "normal", "30d")',
    'assert check("incident", "incident", "90d")',
    'assert check("normal", "normal", "30d", "  compaction_disabled: false\\n")',
    'assert not check("normal", "normal", "29d")',
    'assert not check("incident", "incident", "30d")',
    'assert not check("normal", "default overrides", "30d")',
    'assert not check("normal", "incident", "30d")',
    'assert not check("normal", "normal", "30d", "  compaction_disabled: true\\n")',
    'assert not check("normal", "normal", "30d", "  compaction_disabled: false\\n  compaction_disabled: true\\n")',
    'print("TEMPO_RETENTION_CANONICAL_READBACK_PASS")'
  ].join('\n');
  const stdout = execFileSync('python3', ['-c', script, fileURLToPath(RETENTION_PROBE)], { encoding: 'utf8' });
  assert.match(stdout, /TEMPO_RETENTION_CANONICAL_READBACK_PASS/);
});

test('production runtime canary queries Tempo in the normal retention tenant', async () => {
  const canary = await readFile(CANARY, 'utf8');
  assert.match(canary, /TRUYN_TRACE_RETENTION_CLASS/);
  assert.match(canary, /retentionClass !== 'normal'/);
  assert.match(canary, /headers: \{ 'X-Scope-OrgID': retentionClass \}/);
  assert.match(canary, /retentionClass,/);
  assert.match(canary, /server\.listen\(9466, '127\.0\.0\.1'/);
});

test('manual Tempo production retry is exact-main only, shares the exclusive ACA writer', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');
  assert.ok(workflow.includes('workflow_dispatch:'));
  assert.ok(workflow.includes("github.event_name == 'workflow_dispatch') && github.ref == 'refs/heads/main'"));
  assert.ok(workflow.includes("group: truyn-production-aca-exclusive-writer"));
  assert.ok(workflow.includes("cancel-in-progress: false"));
  assert.ok(workflow.includes("Production apply refused: protected main changed since this run was queued."));
  assert.ok(workflow.includes("'infra/production-tracing/**'"));
  const pushPaths = workflow.split('  push:')[1]?.split('\npermissions:')[0] || '';
  assert.ok(!pushPaths.includes("'.github/workflows/production-trace-backend.yml'"));
});

test('trace backend workflow validates and live-proves 30d normal plus 90d incident retention', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');
  assert.match(workflow, /REGION_PAIRS:.*germanywestcentral:francecentral northeurope:swedencentral/);
  assert.match(workflow, /infra\/production-dr\/\*\*/);
  assert.match(workflow, /NORMAL_TRACE_RETENTION_DAYS: '30'/);
  assert.match(workflow, /INCIDENT_TRACE_RETENTION_DAYS: '90'/);
  assert.match(workflow, /\$\{GITHUB_REPOSITORY\}:\$\{DEPLOYMENT_ID\}:\$\{selected_prefix\}:tempo/);
  assert.match(workflow, /TRUYN_TRACE_RETENTION_PASS normal_days=30 incident_days=90/);
  assert.match(workflow, /normalRetentionConfigObserved: true/);
  assert.match(workflow, /incidentRetentionConfigObserved: true/);
  assert.match(workflow, /normalTraceReadBackObserved: true/);
  assert.match(workflow, /incidentTraceReadBackObserved: true/);
  assert.match(workflow, /schema: "truyn\.production-trace-backend-evidence\/v2"/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});
