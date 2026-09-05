import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/publish-sdk-alpha.yml', import.meta.url), 'utf8');
const supersededWorkflow = await readFile(new URL('../.github/workflows/go-sdk-alpha-release.yml', import.meta.url), 'utf8');
const marker = JSON.parse(await readFile(new URL('../sdk/release/registry-closure.json', import.meta.url), 'utf8'));

test('alpha.2 repair publishes only through the configured npm Trusted Publisher workflow', () => {
  assert.match(workflow, /name: SDK Registry Closure/);
  assert.match(workflow, /tags:\s*\n\s*- 'sdk\/npm\/v0\.1\.0-alpha\.2-release\.1'/);
  assert.doesNotMatch(workflow, /workflow_run:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /environment: sdk-release/);
  const publishStep = workflow.match(/      - name: Publish immutable npm alpha\.2 repair through Trusted Publishing\n[\s\S]*?(?=\n      - name: )/)?.[0];
  assert.ok(publishStep, 'trusted-publishing step must exist');
  assert.match(publishStep, /npm publish[\s\S]*--access public --provenance/);
  assert.doesNotMatch(publishStep, /NODE_AUTH_TOKEN/);
  assert.doesNotMatch(supersededWorkflow, /npm publish/);
});

test('registry repair marker is exact, immutable and tag-bound', () => {
  assert.deepEqual(marker, {
    npmPackage: '@truyn/sdk',
    npmVersion: '0.1.0-alpha.2',
    npmDistTag: 'alpha',
    npmReleaseTag: 'sdk/npm/v0.1.0-alpha.2-release.1',
    npmSupersedes: '0.1.0-alpha.1',
    npmRepairReason: '0.1.0-alpha.1 is immutable and fails clean-room Node 22 ESM import because ws was bundled as CommonJS dynamic require',
    pypiPackage: 'truyn-sdk',
    pypiVersion: '0.1.0a1',
    pypiWheelFilename: 'truyn_sdk-0.1.0a1-py3-none-any.whl',
    pypiWheelSha256: 'dec464064dec577aa56d33780c6222ac674accf07fe09ae59af18a191afcd958',
    pypiSdistFilename: 'truyn_sdk-0.1.0a1.tar.gz',
    pypiSdistSha256: 'a2e1e2baa6248cab18bdee08b10e832a39453836a64ad0b55c000f48c890ddaf',
    pypiPublicationSourceSha: 'fda6b75fda5331dd9cdc7e642f7a0a5556749a64',
    repairRevision: 6
  });
  assert.match(workflow, /\. == \{/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/tags\/\$RELEASE_TAG"/);
});

test('publication consumes exact successful main-CI artifact and requires same-source CodeQL', () => {
  assert.match(workflow, /Require exact-source main CI and hosted CodeQL success/);
  assert.match(workflow, /\.github\/workflows\/ci\.yml/);
  assert.match(workflow, /dynamic\/github-code-scanning\/codeql/);
  assert.match(workflow, /gh run download/);
  assert.match(workflow, /truyn-sdk-release-\$\{\{ steps\.gates\.outputs\.ci_run_id \}\}/);
  assert.match(workflow, /verify-release\.mjs sdk\/release\/registry-closure\/ci-bundle/);
  assert.match(workflow, /\.sourceSha == \$source and \.typescript == \$npm/);
  assert.doesNotMatch(workflow, /npm run build --prefix sdk\/typescript/);
});

test('npm verification repairs only absent/alpha.1 tags and refuses rollback from newer versions', () => {
  assert.match(workflow, /npm dist-tag add "\$\{NPM_PACKAGE\}@\$\{NPM_VERSION\}" alpha/);
  assert.match(workflow, /npm dist-tag add "\$\{NPM_PACKAGE\}@\$\{NPM_VERSION\}" latest/);
  assert.match(workflow, /npm audit signatures --json --include-attestations/);
  assert.match(workflow, /expected_path = '\.github\/workflows\/publish-sdk-alpha\.yml'/);
  assert.match(workflow, /resolvedDependencies/);
  assert.match(workflow, /gitCommit/);
  assert.match(workflow, /npmSupersedes/);
  assert.match(workflow, /Refusing to move npm dist-tag/);
  assert.match(workflow, /alphaTagIdentity:\"PASS\"/);
  assert.match(workflow, /latestTagIdentity:\"PASS\"/);
  assert.match(workflow, /provenanceSourceIdentity:\"PASS\"/);
});

test('PyPI remains verification-only and preserves bytes, sizes, PEP 740 publisher SHA and downloads', () => {
  assert.doesNotMatch(workflow, /gh-action-pypi-publish/);
  assert.doesNotMatch(workflow, /PYPI_TOKEN/);
  assert.match(workflow, /'size': len\(data\)/);
  assert.match(workflow, /pypi\.org\/integrity\/\{package\}\/\{version\}\//);
  assert.match(workflow, /publisher\.get\('repository_owner'\) == 'inn-media'/);
  assert.match(workflow, /publisher\.get\('workflow_filename'\) == 'publish-sdk-alpha\.yml'/);
  assert.match(workflow, /claims\.get\('sha'\) == publication_sha/);
  assert.match(workflow, /pypi-attestations verify pypi --repository https:\/\/github\.com\/inn-media\/truyn/);
  assert.match(workflow, /sdk\/release\/registry-closure\/pypi\/\*/);
});
