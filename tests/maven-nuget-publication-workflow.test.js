import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('Maven Central workflow publishes exact CI bytes behind the shared release gates', async () => {
  const wf = await read('.github/workflows/publish-maven.yml');
  assert.match(wf, /sdk\/maven\/v\*/);
  assert.match(wf, /environment:\s*sdk-release/);
  assert.match(wf, /resolve-release-gates\.sh sdk\/maven\/v maven/);
  assert.match(wf, /truyn-sdk-release-\$CI_RUN_ID/);
  assert.match(wf, /verify-release\.mjs/);
  assert.match(wf, /build-maven-bundle\.sh/);
  assert.match(wf, /\/upload\?publishingType=AUTOMATIC/);
  assert.match(wf, /PUBLISHED\) exit 0/);
  assert.match(wf, /gpg --batch --verify/);
  assert.match(wf, /vars\.MAVEN_GPG_FINGERPRINT/);
  assert.match(wf, /::add-mask::/);
  assert.match(wf, /TRUYN_MAVEN_CLEANROOM=PASS/);
  // never rebuild or deploy from source in the publication job
  assert.doesNotMatch(wf, /mvn[^\n]*\b(deploy|package|install)\b/);
  assert.doesNotMatch(wf, /^\s*pull_request/m);
  assert.doesNotMatch(wf, /id-token:\s*write/);
});

test('NuGet workflow uses Trusted Publishing only and fails closed on duplicates', async () => {
  const wf = await read('.github/workflows/publish-nuget.yml');
  assert.match(wf, /sdk\/nuget\/v\*/);
  assert.match(wf, /environment:\s*sdk-release/);
  assert.match(wf, /id-token:\s*write/);
  assert.match(wf, /NuGet\/login@v1/);
  assert.match(wf, /vars\.NUGET_USER/);
  assert.match(wf, /resolve-release-gates\.sh sdk\/nuget\/v nuget/);
  assert.match(wf, /compare-nupkg\.sh/);
  assert.match(wf, /dotnet nuget verify --all/);
  assert.match(wf, /TRUYN_NUGET_CLEANROOM=PASS/);
  assert.match(wf, /publicationAuthentication:"NuGet Trusted Publishing \(GitHub Actions OIDC\)"/);
  assert.doesNotMatch(wf, /secrets\.NUGET/i);
  assert.doesNotMatch(wf, /--skip-duplicate/);
  assert.doesNotMatch(wf, /dotnet (pack|build)/);
  assert.doesNotMatch(wf, /^\s*pull_request/m);
});

test('release gate rejects a tag whose version differs from the package manifest', () => {
  for (const [prefix, kind] of [['sdk/maven/v', 'maven'], ['sdk/nuget/v', 'nuget']]) {
    const r = spawnSync('bash', ['sdk/release/resolve-release-gates.sh', prefix, kind], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_REF: `refs/tags/${prefix}999.0.0`, GITHUB_OUTPUT: '/dev/null' }
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /does not match declared/);
  }
});

test('Maven and NuGet coordinates require accepted public evidence', async () => {
  const coords = JSON.parse(await read('sdk/release/public-coordinates.json')).coordinates;
  const pom = await read('sdk/java/pom.xml');
  const csproj = await read('sdk/dotnet/Truyn.Sdk.csproj');
  assert.match(pom, new RegExp(`<version>${coords.maven.version.replaceAll('.', '\.')}</version>`));
  assert.match(csproj, new RegExp(`<Version>${coords.nuget.version.replaceAll('.', '\.')}</Version>`));
  assert.equal(coords.maven.publicationState, 'accepted');
  assert.equal(coords.nuget.publicationState, 'accepted');
  const evidence = JSON.parse(await read('sdk/release/evidence/nuget-alpha1-2026-09-23.json'));
  assert.equal(evidence.coordinate, 'Truyn.Sdk@0.1.0-alpha.1');
  const publishing = await read('sdk/release/PUBLISHING.md');
  assert.match(publishing, /NuGet\.org is no longer an external Developer Release publication gate/);
  assert.match(publishing, /workflow `publish-nuget\.yml`/);
  assert.match(publishing, /environment `sdk-release`/);
  assert.match(publishing, /package owner `truyn\.org`/);
  assert.match(publishing, /namespace `org\.truyn`/);
});

test('NuGet package carries README, SourceLink metadata and excludes the nested conformance project', async () => {
  const csproj = await read('sdk/dotnet/Truyn.Sdk.csproj');
  assert.match(csproj, /<PackageReadmeFile>README\.md<\/PackageReadmeFile>/);
  assert.match(csproj, /<PublishRepositoryUrl>true<\/PublishRepositoryUrl>/);
  assert.match(csproj, /<Deterministic>true<\/Deterministic>/);
  assert.match(csproj, /DefaultItemExcludes>\$\(DefaultItemExcludes\);conformance\/\*\*/);
  assert.match(csproj, /<None Include="README\.md" Pack="true"/);
});
