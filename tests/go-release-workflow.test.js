import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/publish-sdk-alpha.yml', import.meta.url), 'utf8');
const supersededWorkflow = await readFile(new URL('../.github/workflows/go-sdk-alpha-release.yml', import.meta.url), 'utf8');
const marker = JSON.parse(await readFile(new URL('../sdk/release/registry-closure.json', import.meta.url), 'utf8'));

function step(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return workflow.match(new RegExp(`      - name: ${escaped}\\n[\\s\\S]*?(?=\\n      - name: |$)`))?.[0] || '';
}

test('release.4 remains bounded to successful main CI and same-source security evidence', () => {
  assert.match(workflow, /name: SDK Registry Closure/);
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows:\s*\n\s*- CI/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /environment: sdk-release/);
  assert.match(workflow, /RELEASE_TAG: sdk\/npm\/v0\.1\.0-alpha\.2-release\.4/);
  assert.match(workflow, /SOURCE_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /SOURCE_CI_RUN_ID: \$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(workflow, /dynamic\/github-code-scanning\/codeql/);
  assert.match(workflow, /gh run download/);
});

test('npm publication is token-free and uses GitHub OIDC Trusted Publishing', () => {
  const setup = step('Set up Node.js for npm Trusted Publishing');
  const boundary = step('Require token-free npm Trusted Publishing boundary');
  const publish = step('Publish immutable npm alpha.2 through Trusted Publishing');
  assert.ok(setup && boundary && publish);
  assert.doesNotMatch(setup, /registry-url:/);
  assert.match(boundary, /ACTIONS_ID_TOKEN_REQUEST_URL/);
  assert.match(boundary, /ACTIONS_ID_TOKEN_REQUEST_TOKEN/);
  assert.match(boundary, /test -z "\$\{NODE_AUTH_TOKEN:-\}"/);
  assert.match(publish, /env -u NODE_AUTH_TOKEN -u NPM_TOKEN -u NPM_CONFIG_TOKEN/);
  assert.match(publish, /npm publish[\s\S]*--access public --tag "\$NPM_DIST_TAG" --provenance/);
  assert.doesNotMatch(publish, /secrets\./);
  assert.doesNotMatch(supersededWorkflow, /npm publish/);
});

test('release marker advances immutably after failed release.3', () => {
  assert.equal(marker.npmPackage, '@truyn/sdk');
  assert.equal(marker.npmVersion, '0.1.0-alpha.2');
  assert.equal(marker.npmReleaseTag, 'sdk/npm/v0.1.0-alpha.2-release.4');
  assert.equal(marker.repairRevision, 9);
  assert.match(marker.npmRepairReason, /release\.3/);
  assert.match(marker.npmRepairReason, /NODE_AUTH_TOKEN/);
  assert.match(workflow, /Create or verify immutable release tag after green gates/);
  assert.match(workflow, /git\/matching-refs\/tags\/\$RELEASE_TAG/);
});

test('registry evidence proves bytes tags clean-room import and provenance source identity', () => {
  assert.match(workflow, /cmp "\$local_file" "\$remote_file"/);
  assert.match(workflow, /npm dist-tag add/);
  assert.match(workflow, /npm audit signatures --json --include-attestations/);
  assert.match(workflow, /TruynClient/);
  assert.match(workflow, /TruynLocalNodeClient/);
  assert.match(workflow, /expected TRUYN repository\/workflow\/main\/source SHA/);
  assert.match(workflow, /trustedPublishingOidc:\"PASS\"/);
  assert.match(workflow, /byteIdentity:\"PASS\"/);
  assert.match(workflow, /provenanceSourceIdentity:\"PASS\"/);
});

test('PyPI is verification-only and immutable', () => {
  assert.doesNotMatch(workflow, /gh-action-pypi-publish/);
  assert.doesNotMatch(workflow, /twine upload/);
  assert.match(workflow, /PYPI_VERSION: 0\.1\.0a1/);
  assert.match(workflow, /bdist_wheel/);
  assert.match(workflow, /sdist/);
  assert.match(workflow, /cleanRoomInstall/);
});
