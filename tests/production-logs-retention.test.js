import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const workflowPath = path.join(ROOT, '.github/workflows/production-logs-retention.yml');
const foundationWorkflowPath = path.join(ROOT, '.github/workflows/production-dr-foundation.yml');
const bicepPath = path.join(ROOT, 'infra/production-observability/logs-retention.bicep');
const contractPath = path.join(ROOT, 'operations/production-logs-retention.json');

const read = (file) => readFile(file, 'utf8');

test('Sprint 16 pins hot production logs to 30 days', async () => {
  const [workflow, bicep, contractRaw] = await Promise.all([
    read(workflowPath),
    read(bicepPath),
    read(contractPath)
  ]);
  const contract = JSON.parse(contractRaw);

  assert.equal(contract.hot.backendClass, 'azure-monitor-log-analytics');
  assert.equal(contract.hot.retentionDays, 30);
  assert.equal(contract.hot.interactive, true);
  assert.match(bicep, /param hotRetentionDays int = 30/);
  assert.match(bicep, /retentionInDays: hotRetentionDays/);
  assert.match(workflow, /HOT_LOG_RETENTION_DAYS: '30'/);
  assert.match(workflow, /\.retentionInDays == \$hot/);
  assert.match(workflow, /hotRetentionDays: \$hotRetentionDays/);
});

test('Sprint 16 retains archive and audit logs beyond the 90-day minimum', async () => {
  const [workflow, bicep, contractRaw] = await Promise.all([
    read(workflowPath),
    read(bicepPath),
    read(contractPath)
  ]);
  const contract = JSON.parse(contractRaw);

  assert.equal(contract.archiveAudit.backendClass, 'azure-storage');
  assert.equal(contract.archiveAudit.minimumRequiredDays, 90);
  assert.equal(contract.archiveAudit.retentionDays, 180);
  assert.ok(contract.archiveAudit.retentionDays >= contract.archiveAudit.minimumRequiredDays);
  assert.equal(contract.archiveAudit.lifecycleEnforced, true);

  assert.match(bicep, /@minValue\(90\)[\s\S]*param archiveRetentionDays int = 180/);
  assert.match(bicep, /retain-production-observability-logs/);
  assert.match(bicep, /daysAfterModificationGreaterThan: archiveRetentionDays/);
  assert.match(workflow, /ARCHIVE_LOG_RETENTION_DAYS: '180'/);
  assert.match(workflow, /MIN_ARCHIVE_LOG_RETENTION_DAYS: '90'/);
  assert.match(workflow, /ARCHIVE_LOG_RETENTION_DAYS" -ge "\$MIN_ARCHIVE_LOG_RETENTION_DAYS/);
});

test('logs retention resolver preserves the foundation canonical region order', async () => {
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

test('production Container Apps console and system logs route through Azure Monitor to both retention backends', async () => {
  const [workflow, contractRaw] = await Promise.all([read(workflowPath), read(contractPath)]);
  const contract = JSON.parse(contractRaw);

  assert.equal(contract.source.logsDestination, 'azure-monitor');
  assert.deepEqual([...contract.source.categories].sort(), ['ContainerAppConsoleLogs', 'ContainerAppSystemLogs'].sort());
  assert.equal(contract.routing.workspaceRequired, true);
  assert.equal(contract.routing.archiveStorageRequired, true);
  assert.equal(contract.routing.consoleLogsRequired, true);
  assert.equal(contract.routing.systemLogsRequired, true);

  assert.match(workflow, /--logs-destination azure-monitor/);
  assert.match(workflow, /ContainerAppConsoleLogs/);
  assert.match(workflow, /ContainerAppSystemLogs/);
  assert.match(workflow, /--workspace "\$LOG_WORKSPACE_ID"/);
  assert.match(workflow, /--storage-account "\$LOG_ARCHIVE_ID"/);
  assert.match(workflow, /\.workspaceId == \$workspace/);
  assert.match(workflow, /\.storageAccountId == \$archive/);
});

test('archive storage is private-by-default and only permits Azure service bypass', async () => {
  const bicep = await read(bicepPath);
  assert.match(bicep, /allowBlobPublicAccess: false/);
  assert.match(bicep, /minimumTlsVersion: 'TLS1_2'/);
  assert.match(bicep, /supportsHttpsTrafficOnly: true/);
  assert.match(bicep, /bypass: 'AzureServices'/);
  assert.match(bicep, /defaultAction: 'Deny'/);
});

test('live logs retention mutation is main-only and emits sanitized exact-main evidence', async () => {
  const workflow = await read(workflowPath);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /azure\/login@v2/);
  assert.match(workflow, /TRUYN_LOG_RETENTION_PASS hot_days=30 archive_days=180/);
  assert.match(workflow, /schema: "truyn\.production-logs-retention-evidence\/v1"/);
  assert.match(workflow, /exactMain: true/);
  assert.match(workflow, /archiveMeetsMinimum: \(\$archiveRetentionDays >= \$minimumArchiveRetentionDays\)/);

  const marker = 'schema: "truyn.production-logs-retention-evidence/v1"';
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, 'sanitized evidence block is missing');
  const end = workflow.indexOf("' > production-logs-retention-evidence.json", start);
  assert.ok(end > start, 'sanitized evidence block terminator is missing');
  const evidenceBlock = workflow.slice(start, end);
  for (const forbidden of ['ACA_ENVIRONMENT', 'ACA_ENVIRONMENT_ID', 'RESOURCE_GROUP', 'LOG_WORKSPACE_NAME', 'LOG_ARCHIVE_ACCOUNT']) {
    assert.equal(evidenceBlock.includes(forbidden), false, `${forbidden} leaked into public evidence block`);
  }
});
