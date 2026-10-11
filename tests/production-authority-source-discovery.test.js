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

test('runtime configuration and linkage discovery evaluates all plausible hosts before name heuristics', () => {
  assert.match(workflow, /hosts="\$\(jq/);
  assert.match(workflow, /candidates="\$\(jq[\s\S]*<<<"\$hosts"/);
  assert.match(workflow, /tagged="\$\(jq[\s\S]*<<<"\$hosts"/);
  assert.match(workflow, /config_candidates="\$\(jq[\s\S]*<<<"\$hosts"/);
  assert.doesNotMatch(workflow, /config_candidates="\$\(jq[^\n]*<<<"\$candidates"/);
  assert.match(workflow, /runtime-config-or-linkage-signal/);
  assert.match(workflow, /runtimeConfigOrLinkageSignalCount/);
  assert.match(workflow, /hostCount/);
  assert.match(workflow, /runtimeConfigOrLinkageTypeSummary/);
});

test('runtime linkage discovery uses server-side control-plane metadata, not secret values', () => {
  assert.match(workflow, /az graph query/);
  assert.match(workflow, /TRUYN_ROLE/);
  assert.match(workflow, /TRUYN_AUTHORITY_BOOTSTRAP_B64/);
  assert.match(workflow, /TRUYN_AUTHORITY_BOOTSTRAP_DIGEST/);
  assert.match(workflow, /TRUYN_COSMOS_ENDPOINT/);
  assert.match(workflow, /runtimeText=strcat\(tostring\(c\.command\)/);
  assert.match(workflow, /tostring\(c\.args\)/);
  assert.match(workflow, /tostring\(c\.volumeMounts\)/);
  assert.match(workflow, /tostring\(properties\.template\.volumes\)/);
  assert.match(workflow, /account-tenant\.json/);
  assert.match(workflow, /provider-grants\.json/);
  assert.match(workflow, /runtime-config-or-linkage-signal/);
  assert.match(workflow, /runtimeConfigOrLinkageSignalCount/);
});

test('failed ambiguity still uploads sanitized aggregate evidence before failing closed', () => {
  assert.match(workflow, /status:\"FAIL\"/);
  assert.match(workflow, /candidateTypeSummary/);
  assert.match(workflow, /hostTypeSummary/);
  assert.match(workflow, /runtimeConfigOrLinkageSignalCount/);
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

test('P13 adoption discovery is metadata-only and cannot authorize production cutover', async () => {
  const contract=JSON.parse(await readFile(new URL('../operations/p13-production-cutover-plan.json',import.meta.url),'utf8'));
  const readiness=await readFile(new URL('../scripts/p13-production-readiness.mjs',import.meta.url),'utf8');
  assert.equal(contract.status,'BLOCKED_PRE_STABLE');
  assert.equal(contract.rules.noSyntheticSource,true);
  assert.equal(contract.rules.noLiveMutationByReadinessGate,true);
  assert.equal(contract.rules.requireIndependentAttestation,true);
  assert.match(workflow,/resourceMetadataOnly:true/);
  assert.match(workflow,/dataPlaneRead:false/);
  assert.match(workflow,/topologyPublished:false/);
  assert.match(readiness,/cutoverAuthorized:false/);
  assert.match(readiness,/productionMutationsPerformed:false/);
  assert.match(readiness,/real_source_snapshot_digest_revision_unverified/);
  // This push-triggered audit can identify a source candidate; no data has
  // been read, no snapshot has been attested and no traffic switch is allowed.
});

test('P13 source discovery test changes require full CI qualification', async () => {
  const affected=await readFile(new URL('../scripts/affected-tests.mjs',import.meta.url),'utf8');
  assert.match(affected,/production-authority-source-discovery\\.test\\.js/);
  assert.match(affected,/full=true/);
});
