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

test('release.5 is bounded to successful current-main CI and same-source CodeQL', () => {
  assert.match(workflow, /name: SDK Registry Closure/);
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows:\s*\n\s*- CI/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /environment: sdk-release/);
  assert.match(workflow, /RELEASE_TAG: sdk\/npm\/v0\.1\.0-alpha\.2-release\.5/);
  assert.match(workflow, /test "\$\(git rev-parse origin\/main\)" = "\$SOURCE_SHA"/);
  assert.match(workflow, /dynamic\/github-code-scanning\/codeql/);
  assert.match(workflow, /gh run download/);
});

test('npm publish subprocess is isolated from all legacy token inputs', () => {
  const setup = step('Set up Node.js without registry token injection');
  const publish = step('Publish immutable npm alpha.2 through Trusted Publishing');
  assert.ok(setup && publish);
  assert.doesNotMatch(setup, /registry-url:/);
  assert.match(publish, /npm-oidc-empty\.npmrc/);
  assert.match(publish, /env -u NODE_AUTH_TOKEN -u NPM_TOKEN -u NPM_CONFIG_TOKEN/);
  assert.match(publish, /NPM_CONFIG_USERCONFIG="\$oidc_npmrc"/);
  assert.match(publish, /npm publish[\s\S]*--registry https:\/\/registry\.npmjs\.org\/ --access public --tag "\$NPM_DIST_TAG" --provenance/);
  assert.doesNotMatch(publish, /secrets\./);
  assert.doesNotMatch(supersededWorkflow, /npm publish/);
});

test('release marker records immutable release.5 attempt', () => {
  assert.equal(marker.npmPackage, '@truyn/sdk');
  assert.equal(marker.npmVersion, '0.1.0-alpha.2');
  assert.equal(marker.npmReleaseTag, 'sdk/npm/v0.1.0-alpha.2-release.5');
  assert.equal(marker.repairRevision, 10);
  assert.match(marker.npmRepairReason, /release\.3/);
  assert.match(marker.npmRepairReason, /release\.4/);
  assert.match(workflow, /Create or verify immutable release tag/);
});

test('public npm verification proves immutable bytes tags clean-room import and provenance identity', () => {
  assert.match(workflow, /cmp "\$local_file" "\$remote_file"/);
  assert.match(workflow, /npm dist-tag add/);
  assert.match(workflow, /npm audit signatures --json --include-attestations/);
  assert.match(workflow, /TruynClient/);
  assert.match(workflow, /TruynLocalNodeClient/);
  assert.match(workflow, /expected TRUYN repository\/workflow\/main\/source SHA/);
  assert.match(workflow, /trustedPublishingOidc:\"PASS\"/);
  assert.match(workflow, /byteIdentity:\"PASS\"/);
  assert.match(workflow, /provenanceSourceIdentity:\"PASS\"/);
  assert.match(workflow, /Upload immutable npm registry closure evidence/);
});
