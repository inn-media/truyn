import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/p13-production-readiness.yml',import.meta.url),'utf8');
test('P13 cloud metadata workflow uses OIDC only and never mutates or admits production',()=>{
  assert.match(workflow,/azure\/login@v2/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/push:/);
  assert.match(workflow,/branches: \[main\]/);
  assert.match(workflow,/az cosmosdb list/);
  assert.match(workflow,/az resource list/);
  assert.match(workflow,/sourceDataRead:false/);
  assert.match(workflow,/liveCutoverPermitted:false/);
  assert.match(workflow,/sourceSnapshotVerified:false/);
  assert.match(workflow,/isolatedRestoreVerified:false/);
  assert.doesNotMatch(workflow,/\baz (deployment group|cosmosdb|containerapp|resource) (create|update|delete|set)\b/);
  assert.doesNotMatch(workflow,/TRUYN_AUTHORITY_BOOTSTRAP_B64/);
  assert.doesNotMatch(workflow,/az cosmosdb sql (item|query)/);
});
