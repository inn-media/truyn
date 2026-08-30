import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publishUrl = new URL('../.github/workflows/publish-sdk-alpha.yml', import.meta.url);
const pagesUrl = new URL('../.github/workflows/deploy-developer-site.yml', import.meta.url);

function jobBlock(workflow, jobId) {
  const marker = `  ${jobId}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow is missing ${jobId}`);
  const rest = workflow.slice(start + marker.length);
  const next = rest.search(/^  [a-zA-Z0-9_-]+:\n/m);
  return next === -1 ? rest : rest.slice(0, next);
}

test('SDK publication is immutable-tag-only and separated from ordinary CI', async () => {
  const workflow = await readFile(publishUrl, 'utf8');

  assert.match(workflow, /^name: Publish SDK alpha$/m);
  assert.match(workflow, /^  push:\n    tags:\n      - 'sdk\/go\/v0\.1\.0-alpha\.1'$/m);
  assert.doesNotMatch(workflow, /^    branches:/m);
  assert.doesNotMatch(workflow, /^  pull_request:/m);
  assert.doesNotMatch(workflow, /^  pull_request_target:/m);
  assert.doesNotMatch(workflow, /^  workflow_dispatch:/m);
  assert.match(workflow, /test "\$GITHUB_REF" = 'refs\/tags\/sdk\/go\/v0\.1\.0-alpha\.1'/);
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
  assert.match(workflow, /manifest\.sourceSha.*GITHUB_SHA/);

  for (const job of ['npm', 'pypi', 'nuget', 'maven-central']) {
    assert.match(jobBlock(workflow, job), /^    environment: sdk-release$/m);
  }

  assert.match(jobBlock(workflow, 'npm'), /^      id-token: write$/m);
  assert.match(jobBlock(workflow, 'pypi'), /^      id-token: write$/m);
  assert.match(jobBlock(workflow, 'nuget'), /^      id-token: write$/m);
  assert.doesNotMatch(jobBlock(workflow, 'maven-central'), /id-token: write/);
  assert.match(workflow, /npm publish dist\/typescript\/truyn-sdk-0\.1\.0-alpha\.1\.tgz --access public --provenance/);
  assert.match(workflow, /pypa\/gh-action-pypi-publish@release\/v1/);
  assert.match(workflow, /NuGet\/login@v1/);
  assert.match(workflow, /mvn -B -f sdk\/java\/pom\.xml -Pcentral-release/);
  assert.doesNotMatch(workflow, /NPM_TOKEN|PYPI_TOKEN|NUGET_API_KEY:\s*\$\{\{ secrets\./);
  assert.doesNotMatch(workflow, /--skip-duplicate/);
});

test('developer site deploy is main-only GitHub Pages with least scoped deployment permissions', async () => {
  const workflow = await readFile(pagesUrl, 'utf8');

  assert.match(workflow, /^name: Deploy developer site$/m);
  assert.match(workflow, /^  push:\n    branches:\n      - main$/m);
  assert.match(workflow, /- 'docs\/\*\*'/);
  assert.doesNotMatch(workflow, /^  pull_request:/m);
  assert.doesNotMatch(workflow, /^  pull_request_target:/m);
  assert.doesNotMatch(workflow, /^  workflow_dispatch:/m);
  assert.match(workflow, /^  contents: read$/m);
  assert.match(workflow, /^  pages: write$/m);
  assert.match(workflow, /^  id-token: write$/m);
  assert.match(workflow, /^      name: github-pages$/m);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /path: docs/);
});
