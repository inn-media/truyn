import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const probe=readFileSync(new URL('../.github/a-series/a-soak-1h-public-azure-preflight.sh',import.meta.url),'utf8');
const publicWorkflow=readFileSync(new URL('../.github/workflows/d5000-sku-readonly-20261008.yml',import.meta.url),'utf8');
const liveSource=readFileSync(new URL('../.github/workflows/d5000-attempt1.yml',import.meta.url),'utf8');
test('A-SOAK keeps exact cross-cloud target while qualifying Azure only',()=>{
  assert.match(probe,/requestedAzureVMs:2,requestedGcpVMs:2,nodesPerVM:8,rf:3/);
  assert.match(probe,/gcpComputeEligible:false,crossCloudEligible:false,cloudMutations:0/);
  assert.match(probe,/liveAttempt: "NOT_LAUNCHED"/);
  assert.match(probe,/A_SOAK_1H_ATTEMPT1=NOT_LAUNCHED/);
});
test('A-SOAK read-only two Azure VM availability retains public D-Series quota, family and SKU gates',()=>{
  const syntax=spawnSync('bash',['-n'],{input:probe,encoding:'utf8'});
  assert.equal(syntax.status,0,syntax.stderr);
  for(const marker of ['az vm list-usage','az vm list-skus','NotAvailableForSubscription','family_limit','regional_limit','required=$((2*cores))','ASOAK_AZURE_ADMISSION=BLOCKED_D5000_ACTIVE','ASOAK_AZURE_ADMISSION=BLOCKED_NO_2VM_ELIGIBLE_CAPACITY']) assert.ok(probe.includes(marker),marker);
  assert.doesNotMatch(probe,/az[ \t]+(?:vm[ \t]+(?:create|delete)|group[ \t]+create|role[ \t]+assignment[ \t]+create|deployment[ \t]+create)/);
  assert.doesNotMatch(probe,/gcloud[ \t]+.*(?:create|delete|add-iam-policy-binding)/);
});
test('proven Azure federation and runtime-bundle architecture exist on public main',()=>{
  assert.match(publicWorkflow,/uses: azure\/login@v2/);
  assert.match(publicWorkflow,/id-token: write/);
  assert.match(publicWorkflow,/secrets\[format\('AZURE_\{0\}_ID','CLIENT'\)\]/);
  assert.match(publicWorkflow,/secrets\[format\('AZURE_\{0\}_ID','TENANT'\)\]/);
  assert.match(publicWorkflow,/secrets\[format\('AZURE_\{0\}_ID','SUBSCRIPTION'\)\]/);
  assert.match(liveSource,/scripts\/build-class-d-1000-runtime-bundle\.sh/);
  assert.match(liveSource,/scripts\/d200-stage-runtime-bundle\.sh/);
  assert.match(liveSource,/Block collision with any abandoned D-5000 cloud resources/);
});
