import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflowUrl = new URL('../.github/workflows/ci.yml', import.meta.url);

function jobBlock(workflow, jobId) {
  const startMarker = `  ${jobId}:\n`;
  const start = workflow.indexOf(startMarker);
  assert.notEqual(start, -1, `CI workflow is missing the ${jobId} job`);

  const rest = workflow.slice(start + startMarker.length);
  const nextJob = rest.search(/^  [a-zA-Z0-9_-]+:\n/m);
  return nextJob === -1 ? rest : rest.slice(0, nextJob);
}

test('CI exposes independent required DCO and test checks', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const dcoJob = jobBlock(workflow, 'dco');
  const testJob = jobBlock(workflow, 'test');

  assert.match(workflow, /^  push:\n    branches:\n      - main$/m);
  assert.match(dcoJob, /^    name: DCO$/m);
  assert.match(dcoJob, /node scripts\/check-dco\.mjs "\$base_sha" "\$head_sha"/);
  assert.doesNotMatch(dcoJob, /^    if:/m, 'required DCO job must never be conditionally skipped');
  assert.match(testJob, /^    name: test$/m);
  assert.doesNotMatch(testJob, /scripts\/check-dco\.mjs/);
});
