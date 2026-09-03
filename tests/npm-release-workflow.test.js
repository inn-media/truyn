import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/publish-sdk-alpha.yml', import.meta.url), 'utf8');
const marker = JSON.parse(await readFile(new URL('../sdk/release/npm-alpha-bootstrap.json', import.meta.url), 'utf8'));

test('npm alpha release is bounded to successful exact-main CI', () => {
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows:\s*\n\s*- CI/);
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /SOURCE_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /git diff --name-only HEAD\^ HEAD \| grep -Fxq "\$RELEASE_MARKER"/);
  assert.match(workflow, /eligible=false/);
  assert.match(workflow, /eligible=true/);
});

test('npm alpha release requires same-SHA hosted CodeQL before publication', () => {
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /dynamic\/github-code-scanning\/codeql/);
  assert.match(workflow, /Hosted CodeQL PASS on \$SOURCE_SHA/);
});

test('npm release reproduces the SDK runtime dependency boundary', () => {
  assert.match(workflow, /npm install --ignore-scripts --no-audit --no-fund\n\s*npm install --prefix sdk\/typescript/);
  assert.match(workflow, /npm test --prefix sdk\/typescript/);
  assert.match(workflow, /npm run build --prefix sdk\/typescript/);
});

test('npm bootstrap auth is scoped to the publish step and verified', () => {
  assert.doesNotMatch(workflow, /^\s{6}NODE_AUTH_TOKEN:/m);
  assert.match(workflow, /Bootstrap publish immutable npm version[\s\S]*NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_BOOTSTRAP_TOKEN \|\| secrets\.NPM_TOKEN \}\}/);
  assert.match(workflow, /npm whoami/);
});

test('npm alpha release is immutable, provenance-bearing and registry verified', () => {
  assert.match(workflow, /PACKAGE_NAME: '@truyn\/sdk'/);
  assert.match(workflow, /PACKAGE_VERSION: '0\.1\.0-alpha\.1'/);
  assert.match(workflow, /npm view "\$\{PACKAGE_NAME\}@\$\{PACKAGE_VERSION\}" version/);
  assert.match(workflow, /cmp "sdk\/release\/npm-local\/truyn-sdk-\$\{PACKAGE_VERSION\}\.tgz"/);
  assert.match(workflow, /npm publish "sdk\/release\/npm-local\/truyn-sdk-\$\{PACKAGE_VERSION\}\.tgz" --access public --provenance/);
  assert.match(workflow, /attestations\.url/);
  assert.match(workflow, /npm install --ignore-scripts --no-audit --no-fund "\$\{PACKAGE_NAME\}@\$\{PACKAGE_VERSION\}"/);
  assert.match(workflow, /TruynClient export missing/);
  assert.match(workflow, /createHttpClient export missing/);
  assert.match(workflow, /npm audit signatures/);
  assert.match(workflow, /npm-release-evidence\.json/);
});

test('npm alpha bootstrap marker exactly matches the package release and repair revision', () => {
  assert.deepEqual(marker, {
    package: '@truyn/sdk',
    version: '0.1.0-alpha.1',
    channel: 'alpha',
    bootstrap: true,
    workflowRevision: 2
  });
});
