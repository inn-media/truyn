import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('D-1000 accepted harness uses a digest-pinned runtime bundle and bans network package bootstrap', async () => {
  const finalAcceptance = await readFile('scripts/class-d-1000-final-acceptance.sh', 'utf8');
  const builder = await readFile('scripts/build-class-d-1000-runtime-bundle.sh', 'utf8');

  assert.match(finalAcceptance, /TRUYN_CLASS_D1000_RUNTIME_URL/);
  assert.match(finalAcceptance, /TRUYN_CLASS_D1000_RUNTIME_SHA256/);
  assert.match(finalAcceptance, /sha256sum -c -/);
  assert.match(finalAcceptance, /runtimeBundle=sha256-pinned/);
  assert.match(finalAcceptance, /non-hermetic D-1000 guest bootstrap survived preparation/);
  assert.match(finalAcceptance, /WorkingDirectory=\/opt\/truyn\/app/);
  assert.match(finalAcceptance, /ExecStart=\/opt\/truyn\/runtime\/bin\/node \/opt\/truyn\/app\/network\/testnet\/node-service\.js/);

  assert.match(builder, /git archive/);
  assert.match(builder, /node_modules/);
  assert.match(builder, /copy_tool jq/);
  assert.match(builder, /copy_tool curl/);
  assert.match(builder, /copy_tool openssl/);
  assert.match(builder, /tool-scoped-non-base-abi/);
  assert.match(builder, /is_base_abi_library/);
  assert.match(builder, /libc\.so\.\*/);
  assert.match(builder, /runtime\/lib\/\$name/);
  assert.match(builder, /openssl" req -x509 -newkey rsa:2048/);
  assert.match(builder, /network\/testnet\/node-service\.js/);
  assert.match(builder, /smoke_ready/);
  assert.match(builder, /D-1000 runtime bundle unexpectedly contains a base ABI library/);
  assert.match(builder, /--sort=name/);
  assert.match(builder, /SOURCE_SHA/);
});
