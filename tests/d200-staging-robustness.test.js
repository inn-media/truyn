import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const helper = path.resolve('scripts/d200-stage-runtime-bundle.sh');

function writeMockAz(dir, mode = 'transient') {
  const mock = `#!/usr/bin/env bash\nset -Eeuo pipefail\nstate=\"\${MOCK_AZ_STATE}\"\nmkdir -p \"$(dirname \"$state\")\"\ntouch \"$state\"\nkey=\"$*\"\ncount(){ grep -Fxc \"$1\" \"$state\" || true; }\nmark(){ printf '%s\\n' \"$1\" >>\"$state\"; }\nif [[ \"$key\" == storage\\ account\\ create* ]]; then exit 0; fi\nif [[ \"$key\" == storage\\ account\\ show* ]]; then printf '/subscriptions/test/resourceGroups/truyn/providers/Microsoft.Storage/storageAccounts/mock\\n'; exit 0; fi\nif [[ \"$key\" == account\\ show* ]]; then printf 'oidc-principal\\n'; exit 0; fi\nif [[ \"$key\" == role\\ assignment\\ create* ]]; then\n  [[ \"$key\" == *\"Storage Blob Data Contributor\"* ]]; [[ \"$key\" == *\"--scope /subscriptions/test/resourceGroups/truyn/providers/Microsoft.Storage/storageAccounts/mock\"* ]]; exit 0;\nfi\nfor op in 'storage container create' 'storage blob upload' 'storage blob generate-sas'; do\n  if [[ \"$key\" == $op* ]]; then\n    [[ \"$key\" == *\"--auth-mode login\"* ]]\n    n=$(count \"$op\"); mark \"$op\"\n    if [[ '${mode}' == 'always-fail' ]]; then echo 'AuthorizationPermissionMismatch' >&2; exit 3; fi\n    if [[ '${mode}' == 'empty-sas' && \"$op\" == 'storage blob generate-sas' ]]; then exit 0; fi\n    limit=0; [[ \"$op\" == 'storage container create' ]] && limit=2; [[ \"$op\" == 'storage blob upload' ]] && limit=1; [[ \"$op\" == 'storage blob generate-sas' ]] && limit=2\n    if (( n < limit )); then echo 'AuthorizationPermissionMismatch' >&2; exit 3; fi\n    [[ \"$op\" == 'storage blob generate-sas' ]] && printf 'sig=masked-test-token\\n'\n    exit 0\n  fi\ndone\necho \"unexpected az invocation: $key\" >&2\nexit 90\n`;
  const p = path.join(dir, 'az');
  fs.writeFileSync(p, mock, { mode: 0o755 });
}

function runHelper({ mode = 'transient', maxAttempts = '4' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'truyn-d200-stage-'));
  const bin = path.join(dir, 'bin'); fs.mkdirSync(bin);
  writeMockAz(bin, mode);
  const bundle = path.join(dir, 'runtime.tgz'); fs.writeFileSync(bundle, 'runtime');
  const envFile = path.join(dir, 'github-env');
  const state = path.join(dir, 'az-state');
  const result = spawnSync('bash', [helper], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      MOCK_AZ_STATE: state,
      AZURE_RESOURCE_GROUP: 'truyn',
      TRUYN_D200_LOCATION: 'eastus2',
      RUNTIME_BUNDLE: bundle,
      RUNTIME_SHA: 'a'.repeat(64),
      GITHUB_RUN_ID: '123456789',
      GITHUB_ENV: envFile,
      TRUYN_D200_STAGING_MAX_ATTEMPTS: maxAttempts,
      TRUYN_D200_STAGING_RETRY_DELAY_SECONDS: '0',
    },
  });
  return { dir, envFile, state, result };
}

test('staging preserves OIDC data-plane auth and survives bounded transient authorization races', () => {
  const { envFile, state, result } = runHelper();
  assert.equal(result.status, 0, result.stderr);
  const calls = fs.readFileSync(state, 'utf8');
  assert.equal(calls.match(/storage container create/g)?.length, 3);
  assert.equal(calls.match(/storage blob upload/g)?.length, 2);
  assert.equal(calls.match(/storage blob generate-sas/g)?.length, 3);
  const exported = fs.readFileSync(envFile, 'utf8');
  assert.match(exported, /TRUYN_D200_RUNTIME_URL=https:\/\/td2d200123456789\.blob\.core\.windows\.net\/runtime\/truyn-d200-runtime\.tgz\?sig=masked-test-token/);
  assert.match(result.stdout, /TRUYN_D200_STAGING_COMPLETE .*auth=oidc_data_plane/);
});

test('staging preserves failed command rc and prevents later operations after retry exhaustion', () => {
  const { result, state } = runHelper({ mode: 'always-fail', maxAttempts: '3' });
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stderr, /TRUYN_D200_STAGING_FAILURE operation=container_create attempts=3 exit_code=3/);
  const calls = fs.readFileSync(state, 'utf8');
  assert.equal(calls.match(/storage container create/g)?.length, 3);
  assert.doesNotMatch(calls, /storage blob upload|storage blob generate-sas/);
});

test('empty successful SAS response remains fail-closed', () => {
  const { result, state } = runHelper({ mode: 'empty-sas', maxAttempts: '2' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /TRUYN_D200_STAGING_FAILURE operation=user_delegation_sas attempts=2 exit_code=1/);
  const calls = fs.readFileSync(state, 'utf8');
  assert.match(calls, /storage blob upload/);
  assert.equal(calls.match(/storage blob generate-sas/g)?.length, 2);
});

test('helper forbids shared-key/public-access regressions and keeps least-privilege role', () => {
  const source = fs.readFileSync(helper, 'utf8');
  assert.match(source, /Storage Blob Data Contributor/);
  assert.match(source, /--scope \"\$resource_id\"/);
  assert.match(source, /--auth-mode login/);
  assert.match(source, /--as-user/);
  assert.match(source, /--allow-blob-public-access false/);
  assert.doesNotMatch(source, /account-key|--auth-mode key|allow-blob-public-access true|Storage Blob Data Owner/);
});
