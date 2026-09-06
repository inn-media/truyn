import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflowPath = new URL('../.github/workflows/publish-npm.yml', import.meta.url);
const publishingPath = new URL('../sdk/release/PUBLISHING.md', import.meta.url);

test('npm publication workflow is bound to GitHub OIDC and contains no token-backed publish path', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /environment:\s*sdk-release/);
  assert.match(workflow, /npm@11\.19\.1/);
  assert.match(workflow, /sdk\/npm\/v\*/);
  assert.match(workflow, /npm publish/);
  assert.match(workflow, /--provenance/);
  assert.match(workflow, /--access public/);
  assert.match(workflow, /steps\.source\.outputs\.source_sha/);
  assert.match(workflow, /\.github\/workflows\/ci\.yml/);
  assert.match(workflow, /dynamic\/github-code-scanning\/codeql/);
  assert.match(workflow, /truyn-sdk-release-\$CI_RUN_ID/);
  assert.match(workflow, /publicationAuthentication:\"npm Trusted Publishing \(GitHub Actions OIDC\)\"/);

  assert.doesNotMatch(workflow, /secrets\.NPM/i);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN:\s*\$\{\{/i);
  assert.doesNotMatch(workflow, /NPM_TOKEN:\s*\$\{\{/i);
  assert.doesNotMatch(workflow, /npm whoami/i);
  assert.doesNotMatch(workflow, /npm dist-tag add/i);
});

test('publication contract records the exact npm Trusted Publisher identity', async () => {
  const publishing = await readFile(publishingPath, 'utf8');

  assert.match(publishing, /Repository:\s*`inn-media\/truyn`/);
  assert.match(publishing, /Workflow filename:\s*`publish-npm\.yml`/);
  assert.match(publishing, /Environment:\s*`sdk-release`/);
  assert.match(publishing, /npm trust github @truyn\/sdk/);
  assert.match(publishing, /--allow-publish/);
  assert.match(publishing, /npm access set mfa=publish @truyn\/sdk/);
});
