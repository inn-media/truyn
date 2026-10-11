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


test('P13 DR/trace incident forensics expose only whitelisted Azure metadata and never execute recovery',()=>{
  assert.match(workflow,/az deployment group list/);
  assert.match(workflow,/az deployment operation group list/);
  assert.match(workflow,/az containerapp list/);
  assert.match(workflow,/sourceDataRead:false/);
  assert.match(workflow,/consoleLogsRead:false/);
  assert.match(workflow,/retentionReadbackVerified:false/);
  assert.match(workflow,/liveCutoverPermitted:false/);
  assert.match(workflow,/productionMutationsPerformed:false/);
  assert.match(workflow,/p13-dr-trace-readonly\.json/);
  assert.match(workflow,/test\("\^\[A-Za-z\]\[A-Za-z0-9_\]\{0,63\}\$"\)/);
  assert.doesNotMatch(workflow,/az containerapp logs show/);
  assert.doesNotMatch(workflow,/\baz (deployment|cosmosdb|containerapp|resource) (create|update|delete|set)\b/);
});

test('DR/Tempo forensic classification stays read-only and exports only restricted enums',()=>{
  assert.match(workflow,/az deployment group list/);
  assert.match(workflow,/az deployment operation group list/);
  assert.match(workflow,/az containerapp logs show/);
  assert.match(workflow,/rawDeploymentErrorsExported:false/);
  assert.match(workflow,/rawLogBodiesExported:false/);
  assert.match(workflow,/p13-failure-diagnostic\.json/);
  assert.match(workflow,/LOGSTREAM_RBAC_DENIED/);
  assert.match(workflow,/DR_TEMPO_FORENSICS=COMPLETE/);
  assert.doesNotMatch(workflow,/az\s+deployment\s+group\s+create/);
  assert.doesNotMatch(workflow,/az\s+role\s+assignment\s+create/);
});
