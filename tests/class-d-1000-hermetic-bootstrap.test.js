import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

test('D-1000 accepted harness uses a digest-pinned self-contained runtime bundle and bans network package bootstrap', async () => {
  const finalAcceptance = await readFile('scripts/class-d-1000-final-acceptance.sh', 'utf8');
  const builder = await readFile('scripts/build-class-d-1000-runtime-bundle.sh', 'utf8');
  const runCommand = await readFile('scripts/lib/class-d-run-command.sh', 'utf8');

  assert.match(finalAcceptance, /TRUYN_CLASS_D1000_RUNTIME_URL/);
  assert.match(finalAcceptance, /TRUYN_CLASS_D1000_RUNTIME_SHA256/);
  assert.match(finalAcceptance, /sha256sum -c -/);
  assert.match(finalAcceptance, /runtimeBundle=sha256-pinned/);
  assert.match(finalAcceptance, /non-hermetic D-1000 guest bootstrap survived preparation/);
  assert.match(finalAcceptance, /WorkingDirectory=\/opt\/truyn\/app/);
  assert.match(finalAcceptance, /ExecStart=\/opt\/truyn\/runtime\/bin\/node \/opt\/truyn\/app\/network\/testnet\/node-service\.js/);

  assert.match(runCommand, /TRUYN_GUEST_BOOTSTRAP_ERROR rc=\$rc line=\$LINENO cmd=\$BASH_COMMAND/);
  assert.match(runCommand, /printf '%s\\n%s'/);

  assert.match(builder, /git archive/);
  assert.match(builder, /node_modules/);
  assert.match(builder, /copy_tool node/);
  assert.match(builder, /copy_tool jq/);
  assert.match(builder, /copy_tool curl/);
  assert.match(builder, /copy_tool openssl/);
  assert.match(builder, /ld-linux\|ld-musl/);
  assert.match(builder, /--library-path/);
  assert.match(builder, /runtimeLoader/);
  assert.match(builder, /--sort=name/);
  assert.match(builder, /SOURCE_SHA/);
  assert.match(builder, /SELF="\$\(readlink -f "\$\{BASH_SOURCE\[0\]\}"\)"/);
  assert.match(builder, /symlink-bin\/node/);
  assert.match(builder, /symlink-bin\/jq/);
  assert.match(builder, /symlink-bin\/curl/);
  assert.match(builder, /symlink-bin\/openssl/);
  assert.match(builder, /symlink-bin\/openssl" req -x509/);
});

test('D-1000 VM smoke preflight reproduces the accepted immutable install path on the target Azure image', async () => {
  const smoke = await readFile('scripts/class-d-1000-vm-smoke-preflight.sh', 'utf8');

  assert.match(smoke, /--image Ubuntu2204/);
  assert.match(smoke, /Standard_E2as_v7/);
  assert.match(smoke, /truyn_class_d_remote/);
  assert.match(smoke, /sha256sum -c -/);
  assert.match(smoke, /TRUYN_GUEST_BOOTSTRAP_ERROR rc=/);
  assert.match(smoke, /readlink/);
  assert.match(smoke, /\/usr\/local\/bin\/openssl req -x509/);
  assert.match(smoke, /systemctl enable --now .*d1000-smoke\.service/);
  assert.match(smoke, /127\.0\.0\.1:8740\/status/);
  assert.match(smoke, /127\.0\.0\.1:8740\/record/);
  assert.match(smoke, /TRUYN_VM_SMOKE_NODE_SERVICE=PASS/);
  assert.match(smoke, /TRUYN_VM_SMOKE_NODE_IMPORT=PASS/);
  assert.match(smoke, /TRUYN_CLASS_D1000_VM_SMOKE=PASS/);
  assert.match(smoke, /remaining=0/);
  assert.doesNotMatch(smoke, /apt-get/);
  assert.doesNotMatch(smoke, /git clone/);
  assert.doesNotMatch(smoke, /npm install/);
});

test('D-1000 artifact digests are normalized to canonical sha256:<hex>', async () => {
  const digest = await readFile('scripts/lib/sha256-digest.sh', 'utf8');
  const exporter = await readFile('scripts/class-d-1000-normalize-artifact-digest.sh', 'utf8');
  assert.match(digest, /raw#sha256:/);
  assert.match(digest, /\^\[0-9a-fA-F\]\{64\}\$/);
  assert.match(digest, /printf 'sha256:%s/);
  assert.match(exporter, /truyn_normalize_sha256_digest/);
  assert.match(exporter, /artifact_digest=%s/);

  const hex = '02e743bd6365eb113e66b466515d41157db04fceea644c15d71e39fba4f90d18';
  const plain = execFileSync('bash', ['scripts/class-d-1000-normalize-artifact-digest.sh', hex], { encoding: 'utf8' }).trim();
  const prefixed = execFileSync('bash', ['scripts/class-d-1000-normalize-artifact-digest.sh', `sha256:${hex}`], { encoding: 'utf8' }).trim();
  assert.equal(plain, `sha256:${hex}`);
  assert.equal(prefixed, `sha256:${hex}`);
});
