import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/production-authority-source-discovery.yml', import.meta.url), 'utf8');

test('production authority source discovery is main-only and can auto-run once on adoption', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /if: \(github\.event_name == 'workflow_dispatch' \|\| github\.event_name == 'push'\) && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /azure\/login@v2/);
});

test('push trigger is path-scoped to the S15 discovery contract', () => {
  assert.match(workflow, /push:[\s\S]*branches: \[main\][\s\S]*production-authority-source-discovery\.yml[\s\S]*production-authority-source-discovery\.test\.js/);
});

test('embedded KQL heredocs remain inside the YAML run block', () => {
  assert.match(workflow, /\n\s{10}Resources\n\s{10}\| where type =~ 'microsoft\.app\/containerapps'/);
  assert.match(workflow, /\n\s{10}KQL\n\s{10}\)/);
  assert.doesNotMatch(workflow, /\n(?:Resources|\| (?:where|mv-expand|summarize|project|extend)|KQL)\n/);
});

test('discovery uses subscription-wide read-only control-plane inventory', () => {
  assert.match(workflow, /az resource list --only-show-errors -o json/);
  assert.match(workflow, /az resource show --ids/);
  assert.match(workflow, /subscriptionWide:true/);
  assert.match(workflow, /resourceMetadataOnly:true/);
  assert.doesNotMatch(workflow, /az\s+(?:cosmosdb|containerapp|resource|deployment|storage)\s+(?:create|update|delete|replace|restore|failover|patch)\b/i);
  assert.doesNotMatch(workflow, /az\s+containerapp\s+(?:exec|update|revision\s+restart)\b/i);
});

test('runtime configuration discovery uses names and server-side predicates, not secret values', () => {
  assert.match(workflow, /az graph query/);
  assert.match(workflow, /TRUYN_ROLE/);
  assert.match(workflow, /TRUYN_AUTHORITY_BOOTSTRAP_B64/);
  assert.match(workflow, /TRUYN_AUTHORITY_BOOTSTRAP_DIGEST/);
  assert.match(workflow, /TRUYN_COSMOS_ENDPOINT/);
  assert.match(workflow, /runtime-config-signal/);
  assert.match(workflow, /runtimeConfigSignalCount/);
});

test('failed ambiguity still uploads sanitized aggregate evidence before failing closed', () => {
  assert.match(workflow, /status:\"FAIL\"/);
  assert.match(workflow, /candidateTypeSummary/);
  assert.match(workflow, /runtimeConfigSignalCount/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /Production authority source remains ambiguous or unqualified/);
});

test('discovery never asks Azure for secret values or data-plane contents', () => {
  assert.doesNotMatch(workflow, /secret\s+(?:list|show)/i);
  assert.doesNotMatch(workflow, /show-secrets/i);
  assert.doesNotMatch(workflow, /cosmosdb\s+sql\s+(?:query|container\s+item)/i);
  assert.doesNotMatch(workflow, /storage\s+(?:blob|file)\s+(?:download|list|show)/i);
  assert.match(workflow, /secretValuesRead:false/);
  assert.match(workflow, /dataPlaneRead:false/);
  assert.match(workflow, /cosmosMutated:false/);
});

test('public evidence is sanitized and ambiguity fails closed', () => {
  assert.match(workflow, /candidate_count/);
  assert.match(workflow, /selection_reason/);
  assert.match(workflow, /stateSignalPresent:true/);
  assert.match(workflow, /topologyPublished:false/);
  assert.match(workflow, /::add-mask::%s/);
  assert.doesNotMatch(workflow, /selectedResource(?:Id|Name|Group)|resourceGroupName|resourceId|resourceName/);
});
