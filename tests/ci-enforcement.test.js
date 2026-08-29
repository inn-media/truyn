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

test('CI enforces DCO, exact release tag, tests and bounded native publishers', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const dcoJob = jobBlock(workflow, 'dco');
  const testJob = jobBlock(workflow, 'test');
  const npmJob = jobBlock(workflow, 'publish-npm');
  const pypiJob = jobBlock(workflow, 'publish-pypi');
  const nugetJob = jobBlock(workflow, 'publish-nuget');
  const mavenJob = jobBlock(workflow, 'publish-maven');

  assert.match(workflow, /^  push:\n    branches:\n      - main\n    tags:\n      - 'sdk\/go\/v0\.1\.0-alpha\.1'$/m);
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
  assert.doesNotMatch(testJob, /^    if:/m, 'test must run for PR, main and the exact release tag');
  assert.doesNotMatch(testJob, /scripts\/check-dco\.mjs/);
  assert.match(testJob, /if: github\.event_name == 'push' && github\.ref == 'refs\/tags\/sdk\/go\/v0\.1\.0-alpha\.1'/);
  assert.match(testJob, /test "\$\(git rev-parse HEAD\)" = "\$\(git rev-parse origin\/main\)"/);
  assert.match(testJob, /Five-language executable SDK conformance/);
  assert.match(testJob, /Build and verify SDK release packages/);

  for (const job of [npmJob, pypiJob, nugetJob, mavenJob]) {
    assert.match(job, /^    needs: test$/m);
    assert.match(job, /^    if: github\.event_name == 'push' && github\.ref == 'refs\/tags\/sdk\/go\/v0\.1\.0-alpha\.1' && github\.repository == 'inn-media\/truyn'$/m);
    assert.doesNotMatch(job, /workflow_dispatch/);
    assert.doesNotMatch(job, /pull_request_target/);
    assert.doesNotMatch(job, /contents: write/);
  }

  assert.match(npmJob, /^      id-token: write$/m);
  assert.match(pypiJob, /^      id-token: write$/m);
  assert.match(nugetJob, /^      id-token: write$/m);
  assert.doesNotMatch(mavenJob, /id-token: write/);

  assert.match(npmJob, /npm@11\.19\.0/);
  assert.match(npmJob, /npm publish "\$package" --access public/);
  assert.match(pypiJob, /pypa\/gh-action-pypi-publish@release\/v1/);
  assert.match(nugetJob, /NuGet\/login@v1/);
  assert.match(nugetJob, /vars\.NUGET_USER/);
  assert.match(mavenJob, /-Pcentral-release deploy/);
  assert.match(mavenJob, /test "\$actual" = "\$expected"/);
});
