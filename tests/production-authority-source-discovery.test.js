import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/production-authority-source-discovery.yml', import.meta.url), 'utf8');

test('production authority source discovery is manual-only for Azure read', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /azure\/login@v2/);
});

test('discovery is bounded to read-only resource inspection', () => {
  assert.match(workflow, /az containerapp list/);
  assert.match(workflow, /az containerapp show/);
  assert.doesNotMatch(workflow, /az\s+(?:cosmosdb|containerapp|resource|deployment)\s+(?:create|update|delete|replace|restore|failover|patch)\b/i);
  assert.doesNotMatch(workflow, /az\s+containerapp\s+(?:exec|update|revision\s+restart)\b/i);
});

test('discovery never asks Azure for secret values or Cosmos data', () => {
  assert.doesNotMatch(workflow, /secret\s+(?:list|show)/i);
  assert.doesNotMatch(workflow, /show-secrets/i);
  assert.doesNotMatch(workflow, /cosmosdb\s+sql\s+(?:query|container\s+item)/i);
  assert.match(workflow, /secretValuesRead:false/);
  assert.match(workflow, /cosmosMutated:false/);
});

test('public evidence is sanitized and fail-closed', () => {
  assert.match(workflow, /candidate_count.*-eq 1/);
  assert.match(workflow, /stateSignalPresent:true/);
  assert.match(workflow, /topologyPublished:false/);
  assert.doesNotMatch(workflow, /production-authority-source-discovery-evidence\.json[\s\S]*envNames:/);
});
