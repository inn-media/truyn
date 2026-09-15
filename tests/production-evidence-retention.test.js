import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const workflowPath = path.join(ROOT, '.github/workflows/production-evidence-retention.yml');
const bicepPath = path.join(ROOT, 'infra/production-observability/evidence-retention.bicep');
const contractPath = path.join(ROOT, 'operations/production-evidence-retention.json');
const read = (file) => readFile(file, 'utf8');

test('Sprint 18 requires at least one year of immutable acceptance evidence retention', async () => {
  const [workflow, bicep, contractRaw] = await Promise.all([read(workflowPath), read(bicepPath), read(contractPath)]);
  const contract = JSON.parse(contractRaw);

  assert.equal(contract.backend.class, 'azure-blob-immutable');
  assert.equal(contract.backend.immutability, 'time-based-worm');
  assert.equal(contract.backend.requiredState, 'Locked');
  assert.equal(contract.backend.minimumRequiredDays, 365);
  assert.ok(contract.backend.retentionDays >= 365);
  assert.deepEqual([...contract.evidence.classes].sort(), ['drill', 'pager', 'slo-acceptance'].sort());
  assert.match(bicep, /@minValue\(365\)[\s\S]*param evidenceRetentionDays int = 365/);
  assert.match(workflow, /EVIDENCE_RETENTION_DAYS: '365'/);
  assert.match(workflow, /MIN_EVIDENCE_RETENTION_DAYS: '365'/);
});

test('evidence vault is private and keyless by default', async () => {
  const bicep = await read(bicepPath);
  assert.match(bicep, /allowBlobPublicAccess: false/);
  assert.match(bicep, /allowSharedKeyAccess: false/);
  assert.match(bicep, /defaultToOAuthAuthentication: true/);
  assert.match(bicep, /minimumTlsVersion: 'TLS1_2'/);
  assert.match(bicep, /supportsHttpsTrafficOnly: true/);
  assert.match(bicep, /publicNetworkAccess: 'Disabled'/);
  assert.match(bicep, /defaultAction: 'Deny'/);
  assert.match(bicep, /publicAccess: 'None'/);
});

test('live workflow creates or extends then locks the WORM policy and fails closed below 365 days', async () => {
  const workflow = await read(workflowPath);
  assert.match(workflow, /immutability-policy create/);
  assert.match(workflow, /immutability-policy extend/);
  assert.match(workflow, /immutability-policy lock/);
  assert.match(workflow, /--if-match "\$etag"/);
  assert.match(workflow, /\[\[ "\$state" == 'Locked' \]\]/);
  assert.match(workflow, /"\$period" -ge "\$MIN_EVIDENCE_RETENTION_DAYS"/);
  assert.match(workflow, /TRUYN_EVIDENCE_RETENTION_PASS retention_days=\$\{period\} immutable=locked classes=drill,pager,slo-acceptance/);
});

test('GitHub artifact is only short-lived sanitized proof, not the canonical evidence archive', async () => {
  const [workflow, contractRaw] = await Promise.all([read(workflowPath), read(contractPath)]);
  const contract = JSON.parse(contractRaw);
  assert.equal(contract.transport.githubArtifactIsCanonicalArchive, false);
  assert.equal(contract.transport.githubArtifactRetentionDays, 30);
  assert.match(workflow, /name: production-evidence-retention-evidence/);
  assert.match(workflow, /retention-days: 30/);

  const marker = 'schema:"truyn.production-evidence-retention-evidence/v1"';
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, 'sanitized Sprint 18 evidence block missing');
  const end = workflow.indexOf("' > production-evidence-retention-evidence.json", start);
  assert.ok(end > start, 'sanitized evidence block terminator missing');
  const evidenceBlock = workflow.slice(start, end);
  for (const forbidden of ['RESOURCE_GROUP', 'EVIDENCE_ACCOUNT', 'AZURE_SUBSCRIPTION_VALUE', 'AZURE_TENANT_VALUE', 'AZURE_CLIENT_VALUE']) {
    assert.equal(evidenceBlock.includes(forbidden), false, `${forbidden} leaked into sanitized evidence`);
  }
});

test('Sprint 18 workflow mutates Azure only from exact main push', async () => {
  const workflow = await read(workflowPath);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /azure\/login@v2/);
  assert.match(workflow, /exactMain:true/);
});
