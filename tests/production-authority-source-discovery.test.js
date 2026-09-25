import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/production-authority-source-discovery.yml', import.meta.url), 'utf8');

test('production authority source discovery is main-only and path scoped', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /production-authority-source-discovery\.yml/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /azure\/login@v2/);
});

test('embedded KQL heredocs remain inside the YAML run block', () => {
  assert.match(workflow, /\n\s{10}Resources\n\s{10}\| where type/);
  assert.match(workflow, /\n\s{10}KQL\n\s{10}\)/);
  assert.doesNotMatch(workflow, /\n(?:Resources|\| (?:where|mv-expand|summarize|project|extend)|KQL)\n/);
});

test('discovery remains read-only and subscription-wide', () => {
  assert.match(workflow, /az resource list --only-show-errors -o json/);
  assert.match(workflow, /az resource show --ids/);
  assert.match(workflow, /az graph query/);
  assert.match(workflow, /subscriptionWide:true/);
  assert.match(workflow, /resourceMetadataOnly:true/);
  assert.doesNotMatch(workflow, /az\s+(?:cosmosdb|containerapp|resource|deployment|storage)\s+(?:create|update|delete|replace|restore|failover|patch)\b/i);
  assert.doesNotMatch(workflow, /az\s+containerapp\s+(?:exec|update|revision\s+restart)\b/i);
});

test('reference metadata expands beyond runtime command linkage without reading values', () => {
  assert.match(workflow, /tostring\(e\.secretRef\)/);
  assert.match(workflow, /tostring\(c\.volumeMounts\)/);
  assert.match(workflow, /tostring\(v\.storageName\)/);
  assert.match(workflow, /microsoft\.storage\/storageaccounts\/blobservices\/containers/);
  assert.match(workflow, /microsoft\.storage\/storageaccounts\/fileservices\/shares/);
  assert.match(workflow, /runtime-reference-metadata-signal/);
  assert.match(workflow, /runtimeReferenceMetadataSignalCount/);
  assert.doesNotMatch(workflow, /tostring\(e\.value\)/);
  assert.doesNotMatch(workflow, /properties\.configuration\.secrets/);
});

test('canonical five-part state markers remain represented in linkage discovery', () => {
  for (const marker of ['account-tenant.json','provider-grants.json','entitlements.json','revocations.json','accounting.json']) {
    assert.ok(workflow.includes(marker));
  }
});

test('ambiguity remains fail closed with sanitized aggregate evidence', () => {
  assert.match(workflow, /status:\"FAIL\"/);
  assert.match(workflow, /hostTypeSummary/);
  assert.match(workflow, /candidateTypeSummary/);
  assert.match(workflow, /runtimeReferenceMetadataTypeSummary/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /Production authority source remains ambiguous or unqualified/);
  assert.match(workflow, /::add-mask::%s/);
  assert.doesNotMatch(workflow, /selectedResource(?:Id|Name|Group)|resourceGroupName|resourceId|resourceName/);
});

test('discovery never asks Azure for secret values or state data-plane contents', () => {
  assert.doesNotMatch(workflow, /secret\s+(?:list|show)/i);
  assert.doesNotMatch(workflow, /show-secrets/i);
  assert.doesNotMatch(workflow, /cosmosdb\s+sql\s+(?:query|container\s+item)/i);
  assert.doesNotMatch(workflow, /storage\s+(?:blob|file)\s+(?:download|list|show)/i);
  assert.match(workflow, /secretValuesRead:false/);
  assert.match(workflow, /dataPlaneRead:false/);
  assert.match(workflow, /cosmosMutated:false/);
  assert.match(workflow, /topologyPublished:false/);
});
