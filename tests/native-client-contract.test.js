import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('native client is a real Tauri GUI requester and not a renamed managed-client tgz', async () => {
  const [cargo, cargoLock, packageLock, config, rust, html, js, workflow] = await Promise.all([
    read('clients/native/src-tauri/Cargo.toml'),
    read('clients/native/src-tauri/Cargo.lock'),
    read('clients/native/package-lock.json'),
    read('clients/native/src-tauri/tauri.conf.json'),
    read('clients/native/src-tauri/src/lib.rs'),
    read('clients/native/ui/index.html'),
    read('clients/native/ui/app.js'),
    read('.github/workflows/native-clients.yml')
  ]);

  assert.match(cargo, /tauri\s*=\s*\{\s*version\s*=\s*"=2\.12\.0"/);
  assert.match(cargo, /ryu-js = "=1\.0\.3"/);
  assert.match(cargoLock, /name = "truyn-native-client"/);
  assert.match(cargoLock, /name = "ryu"/);
  assert.match(packageLock, /"lockfileVersion": 3/);
  assert.match(packageLock, /"@tauri-apps\/cli": "2\.12\.0"/);
  assert.match(config, /"productName": "TRUYN"/);
  assert.match(config, /"identifier": "org\.truyn\.client"/);
  assert.match(config, /"frontendDist": "\.\.\/ui"/);

  for (const marker of ['Ed25519', '/v1/register', '/v1/offers', '/v1/needs', '/v1/requests/', '/v1/revoke', 'verify_envelope', 'resultVerified', 'tcj1_bytes']) {
    assert.ok(rust.includes(marker), 'native Rust core lost ' + marker);
  }
  assert.match(rust, /public relay URLs must use https/);
  assert.match(rust, /public relay hostname resolves to a non-public address/);
  assert.match(rust, /session:\s*RwLock<Option<RelaySession>>/);
  assert.match(rust, /active_need:\s*RwLock<Option<ActiveNeed>>/);
  assert.match(rust, /create_new\(true\)/);
  assert.match(rust, /RESULT signer does not match the accepted NEED provider/);
  assert.match(rust, /relay NEED receipt does not match the submitted signed request/);
  assert.match(rust, /active-need\.json/);
  assert.match(rust, /submitted_unconfirmed/);
  assert.match(rust, /RESULT metadata must be an object/);
  assert.match(rust, /fs::hard_link/);
  assert.match(rust, /checked_add\(Duration::from_millis\(expires_in_ms\)\)/);
  assert.match(rust, /createdAt is not a parseable RFC3339 timestamp/);
  assert.match(rust, /cannot atomically commit active-request state/);
  assert.match(rust, /is_unauthorized/);
  assert.match(rust, /verificationError/);
  assert.match(rust, /resolve_to_addrs/);
  assert.match(rust, /update_active_need_if_current/);
  assert.match(rust, /resumeStatus/);
  assert.match(rust, /active_need_backup_path\(&state\.active_need_path\)/);
  const storedActiveNeed = rust.match(/struct StoredActiveNeed \\{([\\s\\S]*?)\\n\\}/)?.[1] || '';
  assert.doesNotMatch(storedActiveNeed, /token/i);

  for (const label of ['Connect', 'Discover', 'Send NEED', 'RESULT']) {
    assert.ok(html.includes(label), 'GUI lost ' + label);
  }
  for (const command of ['client_info', 'connect', 'discover', 'submit_need', 'request_status', 'cancel_need']) {
    assert.ok(js.includes('"' + command + '"'), 'frontend lost command ' + command);
  }
  assert.match(js, /Status check failed; retrying without abandoning the active request/);
  assert.match(js, /recoverActive: true/);
  assert.match(js, /generation !== pollGeneration \|\| activeNeedId !== needId/);
  assert.match(js, /Terminal RESULT was rejected by native verification/);
  assert.match(js, /Relay no longer had this request/);
  assert.match(js, /completed before cancel/);
  assert.match(js, /Retrieving and verifying RESULT/);

  assert.match(workflow, /bundle: nsis/);
  assert.match(workflow, /bundle: dmg/);
  assert.match(workflow, /bundle: deb/);
  assert.match(workflow, /android build --debug --apk/);
  assert.match(workflow, /npm ci --ignore-scripts --no-audit --no-fund/);
  assert.match(workflow, /cargo metadata --locked --manifest-path clients\/native\/src-tauri\/Cargo\.toml/);
  assert.match(workflow, /cargo test --locked --manifest-path clients\/native\/src-tauri\/Cargo\.toml --lib/);
  assert.doesNotMatch(workflow, /Export regenerated Cargo lockfile/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /\.exe/);
  assert.match(workflow, /\.dmg/);
  assert.match(workflow, /\.deb/);
  assert.match(workflow, /\.apk/);
});

test('native UI does not load remote scripts or expose provider credentials', async () => {
  const [html, js, rust] = await Promise.all([
    read('clients/native/ui/index.html'),
    read('clients/native/ui/app.js'),
    read('clients/native/src-tauri/src/lib.rs')
  ]);
  assert.doesNotMatch(html, /<script[^>]+src=["']https?:/i);
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:/i);
  assert.doesNotMatch(js, /innerHTML\s*=/);
  for (const secret of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'AZURE_CLIENT_SECRET', 'GCP_SERVICE_ACCOUNT']) {
    assert.equal(rust.includes(secret), false);
    assert.equal(js.includes(secret), false);
  }
});

test('Android build excludes the node signing identity from backup and transfer', async () => {
  const [patcher, legacy, modern, pkg] = await Promise.all([
    read('clients/native/android/apply-backup-rules.mjs'),
    read('clients/native/android/backup_rules.xml'),
    read('clients/native/android/data_extraction_rules.xml'),
    read('clients/native/package.json')
  ]);
  assert.match(patcher, /android:allowBackup/);
  assert.match(patcher, /android:dataExtractionRules/);
  assert.match(legacy, /<exclude domain="file" path="\." \/>/);
  assert.match(modern, /<device-transfer>/);
  assert.match(pkg, /"android:init"/);
});
