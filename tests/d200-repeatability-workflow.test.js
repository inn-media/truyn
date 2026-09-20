import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const repo = resolve(new URL('..', import.meta.url).pathname);
const acceptedPath = join(repo, '.github/workflows/d200-acceptance.yml');
const repeatPath = join(repo, '.github/workflows/d200-repeatability-01.yml');
const launchToken = join(repo, '.github/d200-repeatability/launch-01.txt');

function evaluatorPredicate(source) {
  const match = source.match(/jq -e '([^']+)' "\$f" >\/dev\/null/);
  assert.ok(match, 'strict jq evaluator predicate must be present');
  return match[1].replace(/\s+/g, ' ').trim();
}

test('D-200 repeatability 01 keeps the accepted evaluator byte-equivalent and remains a separate one-shot run', async () => {
  const accepted = await readFile(acceptedPath, 'utf8');
  const repeat = await readFile(repeatPath, 'utf8');

  assert.equal(evaluatorPredicate(repeat), evaluatorPredicate(accepted), 'repeatability evaluator must not weaken or change accepted D-200 predicates');

  assert.match(repeat, /TASK_ID: truyn-d200-repeatability-01-260920-r1/);
  assert.match(repeat, /REPEAT_ID: d200-repeat-01/);
  assert.match(repeat, /REFERENCE_RUN: '35503894414'/);
  assert.match(repeat, /TESTED_COMMIT: e91c165c67c655deb80df4511ca346acb9f1f45b/);
  assert.match(repeat, /TESTED_TREE_SHA: 3a402ba72502de12ed2277db3c9f472872f44b46/);
  assert.match(repeat, /EXACT_MAIN_CI_RUN: '35500410155'/);
  assert.match(repeat, /EXACT_MAIN_FIVE_PATCH_RUN: '35500410293'/);
  assert.match(repeat, /QUALIFIED_TREE_CODEQL_CHECK: '106050818849'/);
  assert.match(repeat, /QUALIFIED_TREE_CODEQL_SHA: 293e3cf5da54e58e37a8d3bb3c138b05bf03e36b/);

  assert.match(repeat, /paths:\n\s+- '\.github\/d200-repeatability\/launch-01\.txt'/);
  assert.match(repeat, /group: truyn-d200-repeatability-01-e91c165c/);
  assert.match(repeat, /\[\[ "\$GITHUB_RUN_ATTEMPT" == 1/);
  assert.match(repeat, /\.files\[0\]\.filename==\$t and \.files\[0\]\.status=="added"/);
  assert.match(repeat, /WORKFLOW_BLOB_SHA/);
  assert.match(repeat, /actual_workflow_blob/);

  assert.match(repeat, /REQUIRED_LOCATION: eastus2/);
  assert.match(repeat, /REQUIRED_VM_SIZE: Standard_E2as_v7/);
  assert.match(repeat, /TRUYN_D200_REPEAT_CAPACITY_PROBE/);
  assert.doesNotMatch(repeat, /for l in eastus2 eastus westus2/, 'repeatability run must not silently fall back to another placement');

  assert.match(repeat, /CAMPAIGN_RC:-99/);
  assert.match(repeat, /EVALUATOR_RC:-99/);
  assert.match(repeat, /ACK_COUNT" == 100/);
  assert.match(repeat, /ACK_LOSS" == 0/);
  assert.match(repeat, /STAGING_CLEANUP" == true/);
  assert.match(repeat, /STAGING_REMAINING" == 0/);
  assert.match(repeat, /TRUYN_D200_REPEAT_TERMINAL result=\$result/);
  assert.match(repeat, /truyn-class-d200-repeat-01-e91c165c-\$\{\{ github\.run_id \}\}/);

  await assert.rejects(access(launchToken), 'launch token must not exist during preparation; adding it is the single-shot launch operation');
});
