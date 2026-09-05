import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const BICEP = new URL('../infra/production-dr/foundation.bicep', import.meta.url);
const WORKFLOW = new URL('../.github/workflows/production-dr-foundation.yml', import.meta.url);

async function text(url) {
  return readFile(url, 'utf8');
}

test('production DR foundation pins continuous PITR and two-region single-writer authority', async () => {
  const source = await text(BICEP);
  assert.match(source, /backupTier string = 'Continuous30Days'/);
  assert.match(source, /type: 'Continuous'/);
  assert.match(source, /tier: backupTier/);
  assert.match(source, /enableAutomaticFailover: true/);
  assert.match(source, /enableMultipleWriteLocations: false/);
  assert.match(source, /failoverPriority: 0/);
  assert.match(source, /failoverPriority: 1/);
  assert.match(source, /regionCount: 2/);
});

test('production authority Cosmos is Entra-only and private-network only', async () => {
  const source = await text(BICEP);
  assert.match(source, /disableLocalAuth: true/);
  assert.match(source, /publicNetworkAccess: 'Disabled'/);
  assert.match(source, /networkAclBypass: 'None'/);
  assert.match(source, /groupIds:\s*\[\s*'Sql'\s*\]/s);
  assert.match(source, /privatelink\.documents\.azure\.com/);
  assert.match(source, /privateEndpointNetworkPolicies: 'Disabled'/);
  assert.doesNotMatch(source, /listKeys|connectionString|accountKey|primaryKey|secondaryKey/i);
});

test('production authority checkpoint container matches runtime partition contract', async () => {
  const source = await text(BICEP);
  assert.match(source, /containerName string = 'checkpoints'/);
  assert.match(source, /paths:\s*\[\s*'\/partitionKey'\s*\]/s);
  assert.match(source, /kind: 'Hash'/);
  assert.match(source, /version: 2/);
});

test('production authority uses managed identity with bounded data-plane and registry roles', async () => {
  const source = await text(BICEP);
  assert.match(source, /Microsoft\.ManagedIdentity\/userAssignedIdentities/);
  assert.match(source, /00000000-0000-0000-0000-000000000002/);
  assert.match(source, /Microsoft\.DocumentDB\/databaseAccounts\/sqlRoleAssignments/);
  assert.match(source, /7f951dda-4ed3-4680-a7ca-43fe172d538d/);
  assert.match(source, /adminUserEnabled: false/);
});

test('Container Apps foundation is internal and VNet integrated', async () => {
  const source = await text(BICEP);
  assert.match(source, /Microsoft\.App\/managedEnvironments@2025-07-01/);
  assert.match(source, /serviceName: 'Microsoft\.App\/environments'/);
  assert.match(source, /infrastructureSubnetId: acaSubnetId/);
  assert.match(source, /internal: true/);
  assert.match(source, /publicNetworkAccess: 'Disabled'/);
});

test('capacity attempts do not fan out non-Cosmos infrastructure before Cosmos succeeds', async () => {
  const source = await text(BICEP);
  for (const resource of ['vnet', 'authorityIdentity', 'registry', 'cosmosPrivateDns']) {
    assert.match(source, new RegExp(`resource ${resource} `));
  }
  assert.ok((source.match(/dependsOn:\s*\[\s*cosmos\s*\]/g) || []).length >= 4);
});

test('foundation workflow validates PRs but mutates Azure only from main push', async () => {
  const workflow = await text(WORKFLOW);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /push:\s*\n\s*branches: \[main\]/);
  assert.match(workflow, /if: github\.event_name == 'pull_request'/);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /az bicep build --file infra\/production-dr\/foundation\.bicep/);
  assert.match(workflow, /azure\/login@v2/);
  assert.match(workflow, /BACKUP_TIER: Continuous30Days/);
  const validateIndex = workflow.indexOf('validate:');
  const applyIndex = workflow.indexOf('apply:');
  assert.ok(validateIndex >= 0 && applyIndex > validateIndex);
  assert.doesNotMatch(workflow.slice(validateIndex, applyIndex), /azure\/login@v2/);
});

test('foundation deploy is bounded to an existing resource group and never requires subscription-scope RG creation', async () => {
  const workflow = await text(WORKFLOW);
  assert.match(workflow, /RESOURCE_GROUP: \$\{\{ vars\.TRUYN_AZURE_RESOURCE_GROUP \|\| 'truyn' \}\}/);
  assert.match(workflow, /az group show/);
  assert.match(workflow, /az deployment group create/);
  assert.match(workflow, /--resource-group "\$RESOURCE_GROUP"/);
  assert.doesNotMatch(workflow, /az group create/);
});

test('Cosmos region fallback is bounded, deterministic, capacity-only and prefers the proven pair', async () => {
  const workflow = await text(WORKFLOW);
  assert.match(workflow, /TRUYN_DR_REGION_PAIRS \|\| 'germanywestcentral:francecentral northeurope:swedencentral'/);
  assert.match(workflow, /for pair in \$REGION_PAIRS/);
  assert.match(workflow, /\[\[ "\$attempt" -le 2 \]\]/);
  assert.match(workflow, /GITHUB_REPOSITORY_ID}:\$\{primary}:\$\{secondary}/);
  assert.match(workflow, /ServiceUnavailable\|high demand\|capacity\|region access\|LocationNotAvailableForResourceType\|RegionNotAvailable\|NotAvailableForSubscription/);
  assert.match(workflow, /non-regional-capacity reason; fallback is forbidden/);
  assert.match(workflow, /All bounded EU Cosmos region candidates are unavailable/);
  assert.doesNotMatch(workflow, /PRIMARY_LOCATION:|SECONDARY_LOCATION:/);
});

test('live proof pins the actual selected region pair and records fallback evidence', async () => {
  const workflow = await text(WORKFLOW);
  for (const marker of [
    'SELECTED_PRIMARY_LOCATION',
    'SELECTED_SECONDARY_LOCATION',
    'REGION_ATTEMPT_COUNT',
    'REGION_FALLBACK_USED',
    'primaryRegion: $primaryRegion',
    'secondaryRegion: $secondaryRegion',
    'regionAttemptCount: $regionAttemptCount',
    'fallbackUsed: $fallbackUsed',
  ]) assert.ok(workflow.includes(marker), `missing region evidence marker: ${marker}`);
  assert.match(workflow, /\.locationName \/\/ ""\) \| gsub\(" "; ""\) \| ascii_downcase/);
});

test('live proof is null-safe and fail-closed for transformed Azure fields', async () => {
  const workflow = await text(WORKFLOW);
  for (const marker of [
    '(.publicNetworkAccess // "") | ascii_downcase',
    '(.properties.publicNetworkAccess // "") | ascii_downcase',
    '(.privateLinkServiceConnectionState.status // "") | ascii_downcase',
    '(.roleDefinitionId // "") | endswith',
    '(.roleDefinitionId // "") | ascii_downcase',
    '.id // empty',
  ]) assert.ok(workflow.includes(marker), `missing null-safe proof marker: ${marker}`);
  assert.match(workflow, /fail_assertion\(\)/);
  assert.match(workflow, /::error::Live foundation assertion failed:/);
});

test('live proof emits separate diagnostics for Cosmos, ACA, private endpoint and RBAC gates', async () => {
  const workflow = await text(WORKFLOW);
  for (const label of [
    'cosmos-backup-policy',
    'cosmos-region-failover-policy',
    'cosmos-auth-and-public-network',
    'cosmos-checkpoint-partition-contract',
    'cosmos-data-contributor-rbac',
    'aca-internal-vnet',
    'aca-public-network-disabled',
    'cosmos-private-endpoint-approved',
    'registry-pull-rbac',
  ]) assert.ok(workflow.includes(label), `missing live assertion diagnostic: ${label}`);
  assert.match(workflow, /az resource show --ids "\$environment_id" --api-version 2025-07-01/);
});

test('live foundation evidence is emitted only after the semantic backup, replication, RBAC and private-ingress gates', async () => {
  const workflow = await text(WORKFLOW);
  for (const marker of [
    '(.backupPolicy.type // "") == "Continuous"',
    '((.locations // []) | length) == 2',
    '.enableAutomaticFailover',
    '.enableMultipleWriteLocations',
    '.disableLocalAuth',
    'cosmos-private-endpoint-approved',
    'cosmos-data-contributor-rbac',
    'aca-internal-vnet',
    'cosmos-checkpoint-partition-contract',
  ]) assert.ok(workflow.includes(marker), `missing live proof gate: ${marker}`);
  assert.match(workflow, /schemaVersion: 2/);
  assert.match(workflow, /status: "PASS"/);
  assert.match(workflow, /production-dr-foundation-evidence\.json/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.doesNotMatch(workflow, /connectionString|accountKey|listKeys/i);
});
