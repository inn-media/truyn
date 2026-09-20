import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const repo = resolve(new URL('..', import.meta.url).pathname);
const acceptedPath = join(repo, '.github/workflows/d200-acceptance.yml');
const repeat01Path = join(repo, '.github/workflows/d200-repeatability-01.yml');
const repeat02Path = join(repo, '.github/workflows/d200-repeatability-02.yml');
const launch01 = join(repo, '.github/d200-repeatability/launch-01.txt');
const launch02 = join(repo, '.github/d200-repeatability/launch-02.txt');

function evaluatorPredicate(source) {
  const match = source.match(/jq -e '([^']+)' "\$f" >\/dev\/null/);
  assert.ok(match, 'strict jq evaluator predicate must be present');
  return match[1].replace(/\s+/g, ' ').trim();
}

async function maybeRead(path) {
  try { return await readFile(path, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

test('D-200 repeatability runs preserve accepted predicates and repeat 02 restores the original static-secret auth path', async () => {
  const accepted = await readFile(acceptedPath, 'utf8');
  const repeat01 = await readFile(repeat01Path, 'utf8');
  const repeat02 = await readFile(repeat02Path, 'utf8');

  assert.equal(evaluatorPredicate(repeat01), evaluatorPredicate(accepted), 'repeatability 01 evaluator must not weaken accepted D-200 predicates');
  assert.equal(evaluatorPredicate(repeat02), evaluatorPredicate(accepted), 'repeatability 02 evaluator must not weaken accepted D-200 predicates');

  for (const marker of [
    'TASK_ID: truyn-d200-repeatability-02-260920-r2',
    'REPEAT_ID: d200-repeat-02',
    "REFERENCE_RUN: '35503894414'",
    'TESTED_COMMIT: e91c165c67c655deb80df4511ca346acb9f1f45b',
    'TESTED_TREE_SHA: 3a402ba72502de12ed2277db3c9f472872f44b46',
    "EXACT_MAIN_CI_RUN: '35500410155'",
    "EXACT_MAIN_FIVE_PATCH_RUN: '35500410293'",
    "QUALIFIED_TREE_CODEQL_CHECK: '106050818849'",
    'QUALIFIED_TREE_CODEQL_SHA: 293e3cf5da54e58e37a8d3bb3c138b05bf03e36b'
  ]) assert.ok(repeat02.includes(marker), `repeatability 02 lost freeze marker: ${marker}`);

  assert.match(repeat02, /paths: \['\.github\/d200-repeatability\/launch-02\.txt'\]/);
  assert.match(repeat02, /group: truyn-d200-repeatability-02-e91c165c/);
  assert.match(repeat02, /\[\[ "\$GITHUB_RUN_ATTEMPT" == 1/);
  assert.match(repeat02, /\.files\[0\]\.filename==\$t and \.files\[0\]\.status=="added"/);
  assert.match(repeat02, /WORKFLOW_BLOB_SHA/);
  assert.match(repeat02, /actual_workflow_blob/);

  assert.match(repeat02, /client-id: '\$\{\{ secrets\.AZURE_CLIENT_ID \}\}'/);
  assert.match(repeat02, /tenant-id: '\$\{\{ secrets\.AZURE_TENANT_ID \}\}'/);
  assert.match(repeat02, /subscription-id: '\$\{\{ secrets\.AZURE_SUBSCRIPTION_ID \}\}'/);
  assert.doesNotMatch(repeat02, /secrets\[/, 'repeatability 02 must not use dynamic secrets namespace access');
  assert.doesNotMatch(repeat02, /vars\[/, 'repeatability 02 must not substitute repository variables for the existing OIDC secrets');

  assert.match(repeat02, /for l in eastus2 eastus westus2 centralus northcentralus southcentralus westeurope northeurope/);
  assert.match(repeat02, /for z in Standard_D4as_v5 Standard_D4s_v5 Standard_E2as_v7/);
  assert.match(repeat02, /source benchmarks\/scale\/class-d-azure-1000-provision\.sh; source scripts\/d200-stage-isolated-campaign\.sh/);

  assert.match(repeat02, /CAMPAIGN_RC:-99/);
  assert.match(repeat02, /EVALUATOR_RC:-99/);
  assert.match(repeat02, /ACK_COUNT" == 100/);
  assert.match(repeat02, /ACK_LOSS" == 0/);
  assert.match(repeat02, /STAGING_CLEANUP" == true/);
  assert.match(repeat02, /STAGING_REMAINING" == 0/);
  assert.match(repeat02, /TRUYN_D200_REPEAT_TERMINAL result=\$result/);
  assert.match(repeat02, /truyn-class-d200-repeat-02-e91c165c-\$\{\{ github\.run_id \}\}/);

  await access(launch01);
  const token02 = await maybeRead(launch02);
  if (token02 !== null) {
    for (const marker of [
      'TASK_ID=truyn-d200-repeatability-02-260920-r2',
      'REPEAT_ID=d200-repeat-02',
      'REFERENCE_RUN=35503894414',
      'TESTED_COMMIT=e91c165c67c655deb80df4511ca346acb9f1f45b',
      'WORKFLOW_BLOB_SHA='
    ]) assert.ok(token02.includes(marker), `launch-02 token lost marker: ${marker}`);
  }
});
