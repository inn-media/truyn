import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const yaml = readFileSync(new URL('../.github/workflows/publish-npm.yml', import.meta.url), 'utf8');

test('npm trusted publisher manual retry is disabled by default and isolates tag bootstrap', () => {
  assert.match(yaml, /retry_existing_frozen:\n\s+description:/);
  assert.match(yaml, /retry_existing_frozen:[\s\S]*?default: false/);
  assert.match(yaml, /github\.event_name == 'workflow_dispatch' && !inputs\.retry_existing_frozen/);
  assert.match(yaml, /inputs\.retry_existing_frozen == true && inputs\.release_tag == 'sdk\/npm\/v0\.1\.0-alpha\.5'/);
});

test('npm manual retry consumes only accepted frozen source and never mutates tags', () => {
  const source = yaml.slice(yaml.indexOf('      - name: Validate immutable tag'), yaml.indexOf('      - name: Resolve exact-main CI'));
  assert.match(source, /GITHUB_RUN_ATTEMPT.*= 1/);
  assert.match(source, /git merge-base --is-ancestor "\$frozen" HEAD/);
  assert.match(source, /gh api .*git\/ref\/tags\/\$TRUYN_RELEASE_TAG/);
  assert.match(source, /57971b134a41c3e3ea4b42f68e86a7d117036006/);
  assert.match(source, /0\.1\.0-alpha\.5/);
  assert.match(source, /git checkout --detach/);
  assert.doesNotMatch(source, /gh api --method POST/);
  assert.doesNotMatch(source, /npm (install|run) build/);
});

test('npm publishing remains serialized, token-free and verified against immutable CI bytes', () => {
  assert.match(yaml, /group: truyn-npm-sdk-immutable-publication\n\s+cancel-in-progress: false/);
  assert.match(yaml, /environment: sdk-release/);
  assert.match(yaml, /id-token: write/);
  assert.match(yaml, /NPM_TRUSTED_PUBLISHER_EXCHANGE_REJECTED_HTTP_/);
  assert.match(yaml, /NPM_CONFIG_USERCONFIG="\$temp_auth" npm publish/);
  assert.match(yaml, /node sdk\/release\/verify-release\.mjs/);
  assert.match(yaml, /cmp "\$PACKAGE_FILE" "\$remote_file"/);
  assert.match(yaml, /npm audit signatures --json --include-attestations/);
});
