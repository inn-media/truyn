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

test('discovery uses subscription-wide read-only control-plane inventory', () => {
  assert.match(workflow, /az resource list --only-show-errors -o json/);
  assert.match(workflow, /az resource show --ids/);
  assert.match(workflow, /subscriptionWide:true/);
  assert.match(workflow, /resourceMetadataOnly:true/);
  assert.doesNotMatch(workflow, /az\s+(?:cosmosdb|containerapp|resource|deployment|storage)\s+(?:create|update|delete|replace|restore|failover|patch)\b/i);
  assert.doesNotMatch(workflow, /az\s+containerapp\s+(?:exec|update|revision\s+restart)\b/i);
});

test('generic truyn matches cannot win over a unique strong authority signal', () => {
  assert.match(workflow, /primaryStrongCount/);
  assert.match(workflow, /strong-authority-signal/);
  assert.match(workflow, /strong-state-signal/);
  assert.match(workflow, /production\[-_ \]\?authority\|authority\|control/);
  assert.match(workflow, /primary_count.*-eq 1/);
  assert.match(workflow, /secondary_count.*-eq 1/);
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
  assert.match(workflow, /candidate_count.*-gt 0/);
  assert.match(workflow, /Ambiguous production authority source inventory/);
  assert.match(workflow, /selectionReason/);
  assert.match(workflow, /stateSignalPresent:true/);
  assert.match(workflow, /topologyPublished:false/);
  assert.doesNotMatch(workflow, /production-authority-source-discovery-evidence\.json[\s\S]*(selected_id|selected_name|selected_rg)/);
});
