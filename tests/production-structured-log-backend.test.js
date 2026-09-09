import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const read = (relative) => readFile(path.join(ROOT, relative), 'utf8');

const paths = {
  workflow: '.github/workflows/production-structured-log-backend.yml',
  bicep: 'infra/production-observability/structured-log-backend.bicep',
  vector: 'infra/production-observability/structured-log-vector/vector.yaml',
  dockerfile: 'infra/production-observability/structured-log-vector/Dockerfile',
  canary: 'runtime/structured-log-canary.js',
  contract: 'operations/production-structured-log-backend.json'
};

test('Sprint 12 contract requires platform stdout/stderr and field-preserving structured storage', async () => {
  const contract = JSON.parse(await read(paths.contract));
  assert.equal(contract.schema, 'truyn.production-structured-log-backend/v1');
  assert.equal(contract.deploymentId, 'dc4518de-d1bf-4fce-b351-e43d7c152999');
  assert.deepEqual(contract.source.streams, ['stdout', 'stderr']);
  assert.equal(contract.source.category, 'ContainerAppConsoleLogs');
  assert.equal(contract.transport.route, 'azure-monitor-diagnostic-settings-event-hubs');
  assert.equal(contract.transport.eventHubTier, 'Standard');
  assert.equal(contract.transport.firewallDefaultAction, 'Deny');
  assert.equal(contract.transport.trustedMicrosoftServicesForDiagnosticIngest, true);
  assert.equal(contract.transport.collectorPrivateEndpointRequired, true);
  assert.equal(contract.collector.name, 'vector');
  assert.equal(contract.collector.version, '0.58.0');
  assert.equal(contract.collector.ingestTimeJsonParsing, true);
  assert.equal(contract.collector.rawPlatformPayloadRemovedAfterParsing, true);
  assert.equal(contract.collector.backendFeedbackExcluded, true);
  assert.equal(contract.backend.name, 'victorialogs');
  assert.equal(contract.backend.version, '1.52.0');
  assert.equal(contract.backend.publicIngress, false);
  assert.equal(contract.backend.structuredFieldsRequired, true);
  assert.equal(contract.backend.rawJsonBlobAccepted, false);
  assert.equal(contract.backend.durableStorage.type, 'nfs-azure-file');
  assert.equal(contract.backend.durableStorage.tier, 'premium');
  assert.equal(contract.backend.durableStorage.publicNetworkAccess, false);
  assert.equal(contract.backend.durableStorage.privateEndpointRequired, true);
  assert.equal(contract.backend.durableStorage.sharedKeyAccess, false);
  assert.equal(contract.backend.durableStorage.mountPath, '/victoria-logs-data');
  assert.equal(contract.acceptance.stdoutRequired, true);
  assert.equal(contract.acceptance.stderrRequired, true);
  assert.equal(contract.acceptance.fieldReadBackRequired, true);
  assert.equal(contract.acceptance.durableStorageMountRequired, true);
  for (const field of ['event', 'service', 'role', 'traceId', 'requestId', 'needId', 'resultId', 'streamProbe', 'canaryField', 'platform_stream', 'structured']) {
    assert.ok(contract.acceptance.requiredFields.includes(field), `missing required field ${field}`);
  }
  assert.equal(
    contract.acceptance.terminalMarker,
    'TRUYN_STRUCTURED_LOG_PASS stdout=1 stderr=1 fields=preserved raw_blob=0 backend=victorialogs'
  );
});

test('Vector explodes Azure Monitor records and parses application JSON before VictoriaLogs ingestion', async () => {
  const vector = await read(paths.vector);
  assert.match(vector, /type:\s*kafka/);
  assert.match(vector, /topics:\s*\n\s*-\s*"\$\{EVENTHUB_NAME/);
  assert.match(vector, /username:\s*"\$\$ConnectionString"/);
  assert.match(vector, /tls:\s*\n\s*enabled:\s*true/);
  assert.match(vector, /if is_array\(\.records\)/);
  assert.match(vector, /parse_json\(raw\)/);
  assert.match(vector, /\. = merge!\(\., parsed\)/);
  assert.match(vector, /\.structured = true/);
  assert.match(vector, /\._msg = to_string\(parsed\.event\)/);
  assert.match(vector, /\.structured = false\s*\n\s*\._msg = raw/);
  assert.match(vector, /platform_stream/);
  assert.match(vector, /exclude_backend_feedback/);
  assert.match(vector, /LOG_BACKEND_APP/);
  assert.match(vector, /type:\s*elasticsearch/);
  assert.match(vector, /127\.0\.0\.1:9428\/insert\/elasticsearch\//);
  assert.match(vector, /_msg_field:\s*_msg/);
  assert.match(vector, /_time_field:\s*timestamp/);
  for (const rawField of ['Log', 'log', 'message']) {
    assert.match(vector, new RegExp(`del\\(\\.${rawField}\\)`), `raw platform field ${rawField} must be removed after parsing`);
  }
  const structuredStart = vector.indexOf('if err == null && is_object(parsed)');
  const structuredEnd = vector.indexOf('} else {', structuredStart);
  assert.ok(structuredStart >= 0 && structuredEnd > structuredStart, 'structured JSON branch is present');
  const structuredBranch = vector.slice(structuredStart, structuredEnd);
  assert.doesNotMatch(structuredBranch, /\._msg = raw/, 'valid JSON branch must not retain the original JSON blob as _msg');
});

test('Bicep routes environment console logs through protected Event Hubs to private structured backend', async () => {
  const bicep = await read(paths.bicep);
  assert.match(bicep, /ContainerAppConsoleLogs/);
  assert.match(bicep, /Microsoft\.Insights\/diagnosticSettings@2021-05-01-preview/);
  assert.match(bicep, /eventHubAuthorizationRuleId:\s*diagnosticsRule\.id/);
  assert.match(bicep, /name:\s*'Standard'\s*\n\s*tier:\s*'Standard'/);
  assert.match(bicep, /defaultAction:\s*'Deny'/);
  assert.match(bicep, /trustedServiceAccessEnabled:\s*true/);
  assert.match(bicep, /privatelink\.servicebus\.windows\.net/);
  assert.match(bicep, /groupIds:\s*\[\s*'namespace'\s*\]/);
  assert.match(bicep, /rights:\s*\[\s*'Listen'\s*\]/);
  assert.match(bicep, /victoriametrics\/victoria-logs:\$\{victoriaLogsVersion\}/);
  assert.match(bicep, /name:\s*'vector'[\s\S]*image:\s*vectorImage/);
  assert.match(bicep, /VECTOR_DANGEROUSLY_ALLOW_ENV_VAR_INTERPOLATION/);
  assert.match(bicep, /name:\s*'runtime-log-canary'[\s\S]*image:\s*runtimeImage/);
  assert.match(bicep, /TRUYN_VERSION[\s\S]*sourceSha/);
  assert.match(bicep, /external:\s*false/);
  assert.match(bicep, /TRUYN_STRUCTURED_LOG_PASS stdout=1 stderr=1 fields=preserved raw_blob=0 backend=victorialogs/);
  assert.match(bicep, /message != 'structured\.log\.canary'/);
  assert.match(bicep, /message\.startswith\('\{'\)/);
});

test('runtime canary emits the same structured schema to stdout and stderr and remains alive', async () => {
  const canary = await read(paths.canary);
  assert.match(canary, /structuredLogRecord/);
  assert.match(canary, /'structured\.log\.canary'/);
  assert.match(canary, /requestId:\s*'s12-request-01'/);
  assert.match(canary, /needId:\s*'s12-need-01'/);
  assert.match(canary, /resultId:\s*'s12-result-01'/);
  assert.match(canary, /canaryField:\s*'field-value'/);
  assert.match(canary, /process\.stdout\.write/);
  assert.match(canary, /process\.stderr\.write/);
  assert.match(canary, /buildCanaryRecord\('stdout'\)/);
  assert.match(canary, /buildCanaryRecord\('stderr'\)/);
  assert.match(canary, /setInterval\(emitCanary, 15_000\)/);
  assert.doesNotMatch(canary, /\.unref\(\)/);
  assert.doesNotMatch(canary, /await new Promise\(\(\) => \{\}\)/);
});

test('workflow is PR-read-only, exact-main bound, and mounts private durable NFS storage', async () => {
  const workflow = await read(paths.workflow);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(workflow, /if: github\.event_name == 'pull_request'/);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /az bicep build --file infra\/production-observability\/structured-log-backend\.bicep/);
  assert.match(workflow, /validate --no-environment \/etc\/vector\/vector\.yaml/);
  assert.match(workflow, /truyn-runtime:\$\{GITHUB_SHA\}/);
  assert.match(workflow, /sourceSha="\$GITHUB_SHA"/);
  assert.match(workflow, /--kind FileStorage/);
  assert.match(workflow, /--sku Premium_LRS/);
  assert.match(workflow, /--enabled-protocols NFS/);
  assert.match(workflow, /--public-network-access Disabled/);
  assert.match(workflow, /--allow-shared-key-access false/);
  assert.match(workflow, /privatelink\.file\.core\.windows\.net/);
  assert.match(workflow, /--group-id file/);
  assert.match(workflow, /--storage-type NfsAzureFile/);
  assert.match(workflow, /mountPath:"\/victoria-logs-data"/);
  assert.match(workflow, /application\/merge-patch\+json/);
  assert.match(workflow, /--logs-destination azure-monitor/);
  assert.match(workflow, /TRUYN_STRUCTURED_LOG_PASS stdout=1 stderr=1 fields=preserved raw_blob=0 backend=victorialogs/);
  assert.match(workflow, /production-structured-log-backend-evidence/);
});
