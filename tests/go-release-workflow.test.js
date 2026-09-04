import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const workflowUrl = new URL('../.github/workflows/go-sdk-alpha-release.yml', import.meta.url);
const legacyPyPiWorkflowUrl = new URL('../.github/workflows/publish-python-alpha.yml', import.meta.url);
const workflow = await readFile(workflowUrl, 'utf8');
const marker = JSON.parse(await readFile(new URL('../sdk/release/registry-closure.json', import.meta.url), 'utf8'));

test('temporary registry closure is verification-only and bounded to exact successful main CI', async () => {
  await assert.rejects(access(legacyPyPiWorkflowUrl));
  assert.match(workflow, /name: SDK Registry Closure/);
  assert.match(workflow, /name: Verify npm\/PyPI registry closure/);
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows:\s*\n\s*- CI/);
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.match(workflow, /SOURCE_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /git diff --name-only HEAD\^ HEAD \| grep -Fxq "\$RELEASE_MARKER"/);
  assert.match(workflow, /dynamic\/github-code-scanning\/codeql/);
  assert.match(workflow, /environment: sdk-release/);
  assert.doesNotMatch(workflow, /npm publish/);
  assert.doesNotMatch(workflow, /gh-action-pypi-publish/);
  assert.doesNotMatch(workflow, /^\s*id-token:\s*write/m);
});

test('registry closure marker freezes immutable npm and PyPI publication identities', () => {
  assert.deepEqual(marker, {
    npmPackage: '@truyn/sdk',
    npmVersion: '0.1.0-alpha.1',
    npmDistTag: 'alpha',
    npmExpectedSha256: '06c782226ae6cc72b7f9c457b15c8bc188b4efc0e7d28ff3da4819382ef22119',
    npmPublicationSourceSha: '905376383107d802efe4520ae3ab44cb55d10256',
    pypiPackage: 'truyn-sdk',
    pypiVersion: '0.1.0a1',
    pypiWheelFilename: 'truyn_sdk-0.1.0a1-py3-none-any.whl',
    pypiWheelSha256: 'dec464064dec577aa56d33780c6222ac674accf07fe09ae59af18a191afcd958',
    pypiSdistFilename: 'truyn_sdk-0.1.0a1.tar.gz',
    pypiSdistSha256: 'a2e1e2baa6248cab18bdee08b10e832a39453836a64ad0b55c000f48c890ddaf',
    pypiPublicationSourceSha: 'fda6b75fda5331dd9cdc7e642f7a0a5556749a64',
    repairRevision: 3
  });
});

test('npm closure tolerates registry propagation and proves immutable public bytes', () => {
  assert.match(workflow, /Wait for immutable npm version to be publicly readable/);
  assert.match(workflow, /for attempt in \$\(seq 1 120\)/);
  assert.match(workflow, /npm view "\$\{NPM_PACKAGE\}@\$\{NPM_VERSION\}" version 2>\/dev\/null \|\| true/);
  assert.match(workflow, /cmp "\$local_file" "\$remote_file"/);
  assert.match(workflow, /NPM_EXPECTED_SHA256/);
  assert.match(workflow, /npm dist-tag add "\$\{NPM_PACKAGE\}@\$\{NPM_VERSION\}" "\$NPM_DIST_TAG"/);
  assert.match(workflow, /test "\$shasum" = "16c21b36ef460f08cbc7959d0231c21e66d44a6b"/);
  assert.match(workflow, /attestations\.url/);
  assert.match(workflow, /npm audit signatures/);
  assert.match(workflow, /publicationSourceSha:\$publicationSourceSha/);
  assert.match(workflow, /distTagIdentity:"PASS"/);
});

test('PyPI closure verifies exact PEP 740 publisher SHA without republishing', () => {
  assert.doesNotMatch(workflow, /PYPI_TOKEN/);
  assert.match(workflow, /pypi\.org\/integrity\/\{package\}\/\{version\}\//);
  assert.match(workflow, /publisher\.get\('repository_owner'\) == 'inn-media'/);
  assert.match(workflow, /publisher\.get\('repository_name'\) == 'truyn'/);
  assert.match(workflow, /publisher\.get\('workflow_filename'\) == 'publish-sdk-alpha\.yml'/);
  assert.match(workflow, /publisher\.get\('environment'\) == 'sdk-release'/);
  assert.match(workflow, /claims\.get\('sha'\) == publication_sha/);
  assert.match(workflow, /pypi-attestations verify pypi --repository https:\/\/github\.com\/inn-media\/truyn/);
  assert.match(workflow, /--index-url https:\/\/pypi\.org\/simple/);
  assert.match(workflow, /publisherSourceSha.*PASS/);
});
