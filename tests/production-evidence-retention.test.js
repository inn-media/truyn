import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const workflowPath = path.join(ROOT, '.github/workflows/production-evidence-retention.yml');
const foundationWorkflowPath = path.join(ROOT, '.github/workflows/production-dr-foundation.yml');
const bicepPath = path.join(ROOT, 'infra/production-observability/evidence-retention.bicep');
const contractPath = path.join(ROOT, 'operations/production-evidence-retention.json');

const read = (file) => readFile(file, 'utf8');

test('Sprint 18 retains drill, pager and SLO acceptance evidence for at least one year', async () => {
  const [workflow, bicep, contractRaw] = await Promise.all([
    read(workflowPath),
    read(bicepPath),
    read(contractPath)
  ]);
  const contract = JSON.parse(contractRaw);

  assert.deepEqual([...contract.scope.evidenceClasses].sort(), ['drill', 'pager', 'slo']);
  assert.deepEqual([...contract.scope.requiredPrefixes].sort(), ['drill/', 'pager/', 'slo/']);
  assert.equal(contract.scope.operationalTelemetrySeparated, true);
  assert.ok(contract.retention.minimumRequiredDays >= 365);
  assert.ok(contract.retention.configuredDays >= contract.retention.minimumRequiredDays);
  assert.equal(contract.retention.significantlyLongerThanOperationalTelemetry, true);

  assert.match(bicep, /@minValue\(365\)[\s\S]*param evidenceRetentionDays int = 365/);
  assert.match(workflow, /EVIDENCE_RETENTION_DAYS: '365'/);
  assert.match(workflow, /MIN_EVIDENCE_RETENTION_DAYS: '365'/);
  assert.match(workflow, /retention_days=365/);
});

test('evidence store is Entra-only, private-by-default and versioned', async () => {
  const [bicep, contractRaw] = await Promise.all([read(bicepPath), read(contractPath)]);
  const contract = JSON.parse(contractRaw);

  assert.equal(contract.storage.backendClass, 'azure-blob');
  assert.equal(contract.storage.sku, 'Standard_GRS');
  assert.equal(contract.storage.allowSharedKeyAccess, false);
  assert.equal(contract.storage.defaultToOAuthAuthentication, true);
  assert.equal(contract.storage.allowBlobPublicAccess, false);
  assert.equal(contract.storage.networkDefaultAction, 'Deny');
  assert.equal(contract.storage.blobVersioning, true);

  assert.match(bicep, /sku:\s*\{\s*name: 'Standard_GRS'/);
  assert.match(bicep, /allowBlobPublicAccess: false/);
  assert.match(bicep, /allowSharedKeyAccess: false/);
  assert.match(bicep, /defaultToOAuthAuthentication: true/);
  assert.match(bicep, /minimumTlsVersion: 'TLS1_2'/);
  assert.match(bicep, /bypass: 'AzureServices'/);
  assert.match(bicep, /defaultAction: 'Deny'/);
  assert.match(bicep, /isVersioningEnabled: true/);
});

test('immutable storage with versioning and locked WORM are mandatory', async () => {
  const [workflow, bicep, contractRaw] = await Promise.all([
    read(workflowPath),
    read(bicepPath),
    read(contractPath)
  ]);
  const contract = JSON.parse(contractRaw);

  assert.equal(contract.storage.immutableStorageWithVersioning, true);
  assert.equal(contract.storage.allowProtectedAppendWrites, false);
  assert.equal(contract.retention.timeBasedRetentionRequired, true);
  assert.equal(contract.retention.policyStateRequired, 'Locked');
  assert.equal(contract.retention.shorteningOrRemovalAllowed, false);

  assert.match(bicep, /immutableStorageWithVersioning:\s*\{\s*enabled: true/);
  assert.match(workflow, /az storage container immutability-policy create/);
  assert.match(workflow, /az storage container immutability-policy lock/);
  assert.match(workflow, /az storage container immutability-policy show/);
  assert.match(workflow, /== "Locked"/);
  assert.match(workflow, />= \$minimum/);
  assert.match(workflow, /allowProtectedAppendWrites/);
});

test('live acceptance proves all evidence classes can be written and protected data cannot be deleted', async () => {
  const workflow = await read(workflowPath);

  assert.match(workflow, /for class in drill pager slo/);
  assert.match(workflow, /drill\/retention-canary/);
  assert.match(workflow, /pager\/retention-canary/);
  assert.match(workflow, /slo\/retention-canary/);
  assert.match(workflow, /az storage blob upload/);
  assert.match(workflow, /az storage blob show/);
  assert.match(workflow, /az storage blob delete/);
  assert.match(workflow, /BlobImmutableDueToPolicy/);
  assert.match(workflow, /immutableDeleteDenialObserved:true/);
  assert.match(workflow, /TRUYN_EVIDENCE_RETENTION_PASS retention_days=365 state=Locked drill=1 pager=1 slo=1 immutable_delete_denied=1 entra_write=1/);
});

test('Sprint 18 live mutation is exact-main guarded and evidence is sanitized', async () => {
  const workflow = await read(workflowPath);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/git\/ref\/heads\/main"/);
  assert.match(workflow, /current_main" == "\$GITHUB_SHA/);
  assert.match(workflow, /sourceSha:\$sourceSha/);
  assert.match(workflow, /exactMain:true/);
  assert.match(workflow, /sanitized:true/);

  const marker = 'schema:"truyn.production-evidence-retention-evidence/v1"';
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, 'sanitized Sprint 18 evidence block is missing');
  const end = workflow.indexOf("}' > production-evidence-retention-evidence.json", start);
  assert.ok(end > start, 'sanitized Sprint 18 evidence block terminator is missing');
  const evidenceBlock = workflow.slice(start, end);
  for (const forbidden of ['RESOURCE_GROUP', 'EVIDENCE_STORAGE_ACCOUNT', 'EVIDENCE_STORAGE_ACCOUNT_ID', 'EVIDENCE_CONTAINER_ID', 'runner_ip']) {
    assert.equal(evidenceBlock.includes(forbidden), false, `${forbidden} leaked into sanitized evidence`);
  }
});

test('GitHub artifact is explicitly convenience-only; Azure WORM is the durable authority', async () => {
  const [workflow, contractRaw] = await Promise.all([read(workflowPath), read(contractPath)]);
  const contract = JSON.parse(contractRaw);

  assert.equal(contract.githubArtifact.durableAuthority, false);
  assert.equal(contract.githubArtifact.convenienceOnly, true);
  assert.equal(contract.githubArtifact.retentionDays, 30);
  assert.match(workflow, /name: production-evidence-retention-evidence/);
  assert.match(workflow, /retention-days: 30/);
  assert.match(workflow, /slo\/sprint-18\/\$\{GITHUB_SHA\}/);
});

test('evidence retention resolver preserves the foundation canonical region order', async () => {
  const [workflow, foundationWorkflow] = await Promise.all([
    read(workflowPath),
    read(foundationWorkflowPath)
  ]);
  const regionPairLine = (text) => text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('REGION_PAIRS:'));

  const expected = "REGION_PAIRS: ${{ vars.TRUYN_DR_REGION_PAIRS || 'germanywestcentral:francecentral northeurope:swedencentral' }}";
  assert.equal(regionPairLine(foundationWorkflow), expected);
  assert.equal(regionPairLine(workflow), expected);
});
