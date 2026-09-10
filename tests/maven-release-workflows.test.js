import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const publishUrl = new URL('../.github/workflows/publish-maven-central.yml', import.meta.url);
const verifyUrl = new URL('../.github/workflows/verify-maven-release.yml', import.meta.url);
const pomUrl = new URL('../sdk/java/pom.xml', import.meta.url);
const manifestUrl = new URL('../sdk/release/write-maven-manifest.mjs', import.meta.url);

function jobBlock(workflow, jobId) {
  const marker = `  ${jobId}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow is missing ${jobId}`);
  const rest = workflow.slice(start + marker.length);
  const next = rest.search(/^  [a-zA-Z0-9_-]+:\n/m);
  return next === -1 ? rest : rest.slice(0, next);
}

test('Maven Central publication is isolated to one immutable Java tag', async () => {
  const workflow = await readFile(publishUrl, 'utf8');
  const publish = jobBlock(workflow, 'publish');

  assert.match(workflow, /^name: Publish Maven Central alpha$/m);
  assert.match(workflow, /^  push:\n    tags:\n      - 'sdk\/java\/v0\.1\.0-alpha\.1'$/m);
  assert.doesNotMatch(workflow, /^    branches:/m);
  assert.doesNotMatch(workflow, /^  pull_request:/m);
  assert.doesNotMatch(workflow, /^  pull_request_target:/m);
  assert.doesNotMatch(workflow, /^  workflow_dispatch:/m);
  assert.match(publish, /^    environment: sdk-release$/m);
  assert.match(publish, /test "\$GITHUB_REF" = 'refs\/tags\/sdk\/java\/v0\.1\.0-alpha\.1'/);
  assert.match(publish, /test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
  assert.match(publish, /java-version: '17'/);

  for (const secret of [
    'MAVEN_CENTRAL_USERNAME',
    'MAVEN_CENTRAL_PASSWORD',
    'MAVEN_GPG_PRIVATE_KEY',
    'MAVEN_GPG_PASSPHRASE'
  ]) {
    assert.match(publish, new RegExp(`secrets\\.${secret}`));
  }
  assert.doesNotMatch(publish, /MAVEN_CENTRAL_TOKEN/);
  assert.doesNotMatch(publish, /-Dgpg\.passphrase/);
  assert.match(publish, /CA6D3B7C71B66647C22219D2AF546A33EA38ADD8/);
  assert.match(publish, /-Pcentral-release clean deploy/);
  assert.match(publish, /safe-extract\.py/);
  assert.match(publish, /write-maven-manifest\.mjs/);
  assert.match(publish, /actions\/attest-build-provenance@v3/);

  assert.doesNotMatch(publish, /npm publish/);
  assert.doesNotMatch(publish, /gh-action-pypi-publish/);
  assert.doesNotMatch(publish, /NuGet\/login/);
  assert.doesNotMatch(publish, /sdk\/go\/v0\.1\.0-alpha\.1/);
});

test('pre-merge Maven candidate proof is branch-bounded, non-publishing, and secret-free', async () => {
  const workflow = await readFile(verifyUrl, 'utf8');
  const verify = jobBlock(workflow, 'verify');

  assert.match(workflow, /^name: Verify Maven release candidate$/m);
  assert.match(workflow, /^  push:\n    branches:\n      - 'release\/maven-central-\*'$/m);
  assert.match(workflow, /^  pull_request:/m);
  assert.doesNotMatch(workflow, /^  pull_request_target:/m);
  assert.doesNotMatch(workflow, /^  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /environment: sdk-release/);
  assert.match(verify, /server-id: central/);
  assert.match(verify, /server-username: MAVEN_CANDIDATE_USERNAME/);
  assert.match(verify, /server-password: MAVEN_CANDIDATE_PASSWORD/);
  assert.match(verify, /candidate-only-no-upload/);
  assert.match(verify, /ephemeral non-production signing key/i);
  assert.match(verify, /-DskipPublishing=true clean deploy/);
  assert.match(verify, /safe-extract\.py/);
  assert.match(verify, /maven-candidate-evidence\.json/);
  assert.match(verify, /truyn-sdk-0\.1\.0-alpha\.1\.jar\.asc/);
  assert.match(verify, /truyn-sdk-0\.1\.0-alpha\.1-sources\.jar\.asc/);
  assert.match(verify, /truyn-sdk-0\.1\.0-alpha\.1-javadoc\.jar\.asc/);
  assert.match(verify, /truyn-sdk-0\.1\.0-alpha\.1\.pom\.asc/);
});

test('Maven release profile is exact-coordinate, signed, deterministic-bundle Central 0.11.0', async () => {
  const pom = await readFile(pomUrl, 'utf8');

  assert.match(pom, /<groupId>org\.truyn<\/groupId>/);
  assert.match(pom, /<artifactId>truyn-sdk<\/artifactId>/);
  assert.match(pom, /<version>0\.1\.0-alpha\.1<\/version>/);
  assert.match(pom, /<maven\.compiler\.release>17<\/maven\.compiler\.release>/);
  assert.match(pom, /<id>central-release<\/id>/);
  assert.match(pom, /<artifactId>maven-gpg-plugin<\/artifactId>\s*<version>3\.2\.8<\/version>/);
  assert.match(pom, /<bestPractices>true<\/bestPractices>/);
  assert.match(pom, /<passphraseEnvName>MAVEN_GPG_PASSPHRASE<\/passphraseEnvName>/);
  assert.match(pom, /<artifactId>central-publishing-maven-plugin<\/artifactId>\s*<version>0\.11\.0<\/version>/);
  assert.match(pom, /<publishingServerId>central<\/publishingServerId>/);
  assert.match(pom, /<checksums>all<\/checksums>/);
  assert.match(pom, /<outputFilename>truyn-sdk-\$\{project\.version\}-central-bundle\.zip<\/outputFilename>/);
  assert.match(pom, /<autoPublish>true<\/autoPublish>/);
  assert.match(pom, /<waitUntil>published<\/waitUntil>/);
});

test('Maven evidence manifest binds coordinate, source SHA, hashes, tag and signing identity', async () => {
  const source = await readFile(manifestUrl, 'utf8');

  assert.match(source, /truyn\.maven-release\/v1/);
  assert.match(source, /org\.truyn:truyn-sdk:/);
  assert.match(source, /TRUYN_RELEASE_SOURCE_SHA/);
  assert.match(source, /TRUYN_MAVEN_RELEASE_TAG/);
  assert.match(source, /TRUYN_MAVEN_SIGNING_FINGERPRINT/);
  assert.match(source, /createHash\('sha256'\)/);
  assert.match(source, /central-bundle\.zip/);
});
