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

test('CI enforces full-range DCO only for pull requests and keeps test on PR/main', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const dcoJob = jobBlock(workflow, 'dco');
  const testJob = jobBlock(workflow, 'test');

  assert.match(workflow, /^  push:\n    branches:\n      - main$/m);
  assert.match(workflow, /^  pull_request: \{\}$/m);
  assert.doesNotMatch(workflow, /^  workflow_dispatch:/m);

  assert.match(dcoJob, /^    name: DCO$/m);
  assert.match(dcoJob, /^    if: github\.event_name == 'pull_request'$/m);
  assert.match(dcoJob, /DCO_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(dcoJob, /DCO_HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(dcoJob, /node scripts\/check-dco\.mjs "\$DCO_BASE_SHA" "\$DCO_HEAD_SHA"/);
  assert.doesNotMatch(dcoJob, /github\.event\.before/);
  assert.doesNotMatch(dcoJob, /github\.sha/);
  assert.doesNotMatch(dcoJob, /DCO_PUSH_BASE_SHA/);
  assert.doesNotMatch(dcoJob, /workflow_dispatch/);
  assert.doesNotMatch(dcoJob, /git rev-parse/);
  assert.doesNotMatch(dcoJob, /\$\{DCO_HEAD_SHA\}\^/);

  assert.match(testJob, /^    name: test$/m);
  assert.doesNotMatch(testJob, /^    if:/m, 'test must run for both configured events');
  assert.doesNotMatch(testJob, /scripts\/check-dco\.mjs/);
});
