import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('D-1000 provisioner bounds diagnostic nodes per host to 10, 25, or 50', async () => {
  const provision = await readFile('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');

  assert.match(provision, /STRICT_NODES_PER_HOST=50/);
  assert.match(provision, /DIAGNOSTIC_NODES_PER_HOST_SIZES="10 25 50"/);
  assert.match(provision, /NODES_PER_HOST="\$\{TRUYN_CLASS_D1000_NODES_PER_HOST:-\$STRICT_NODES_PER_HOST\}"/);
  assert.match(provision, /case " \$\{DIAGNOSTIC_NODES_PER_HOST_SIZES\} " in/);
  assert.match(provision, /allowed=10\/25\/50/);
  assert.match(provision, /NODE_COUNT=\$\(\(HOST_COUNT \* NODES_PER_HOST\)\)/);
  assert.doesNotMatch(provision, /\nNODES_PER_HOST=50\nNODE_COUNT=/);
});

test('D-1000 provisioner makes remote install failures actionable and reduces fragile source setup', async () => {
  const provision = await readFile('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');

  assert.match(provision, /TRUYN_REMOTE_RETRY vm=/);
  assert.match(provision, /TRUYN_REMOTE_FAILURE vm=/);
  assert.match(provision, /TRUYN_REMOTE_INSTALL_FAILURE host=/);
  assert.match(provision, /TRUYN_REMOTE_INSTALL_READINESS_FAILURE host=/);
  assert.match(provision, /TRUYN_REMOTE_COMMAND_FAILURE stage=/);
  assert.match(provision, /return "\\\$rc"/);
  assert.match(provision, /TRUYN_CLASS_D_1000_CLEANUP_QUERY_FAILURE/);
  assert.match(provision, /left=-1/);
  assert.match(provision, /TRUYN_CLASS_D1000_RUNTIME_URL is required/);
  assert.match(provision, /TRUYN_CLASS_D1000_RUNTIME_SHA256 is required/);
  assert.match(provision, /install_stage=runtime-download/);
  assert.match(provision, /urllib\.request\.urlretrieve/);
  assert.match(provision, /install_stage=runtime-digest/);
  assert.match(provision, /sha256sum -c/);
  assert.match(provision, /install_stage=runtime-manifest/);
  assert.match(provision, /sourceSha == \$sha/);
  assert.match(provision, /WorkingDirectory=\/opt\/truyqn\/app/);
  assert.match(provision, /ExecStart=\/opt\/truyqn\/runtime\/bin\/node \/opt\/truyqn\/app\/network\/testnet\/node-service\.js/);
  assert.match(provision, /--service-endpoints Microsoft\.Storage/);
  assert.doesNotMatch(provision, /apt-get/);
  assert.doesNotMatch(provision, /deb\.nodesource\.com/);
  assert.doesNotMatch(provision, /codeload\.github\.com/);
  assert.doesNotMatch(provision, /npm install/);
  assert.match(provision, /QUIC_IMPORT=PASS/);
  assert.match(provision, /NODE_SERVICE_IMPORT=PASS/);
  assert.match(provision, /journalctl --no-pager -u/);
  assert.doesNotMatch(provision, /git clone -q https:\/\/github\.com\/inn-media\/truyn\.git/);
  assert.doesNotMatch(provision, /git (?:clone|checkout)[^\n]*main/);
});

test('D-1000 strict final acceptance pins the accepted run to exactly 50 nodes per host', async () => {
  const launcher = await readFile('scripts/class-d-1000-final-acceptance.sh', 'utf8');

  assert.match(launcher, /STRICT_D1000_NODES_PER_HOST=50/);
  assert.match(launcher, /export TRUYN_CLASS_D1000_NODES_PER_HOST="\$STRICT_D1000_NODES_PER_HOST"/);
  assert.match(launcher, /grep -Fq 'STRICT_NODES_PER_HOST=50'/);
  assert.match(launcher, /strictNodesPerHost=\$\{TRUYN_CLASS_D1000_NODES_PER_HOST\}/);

  const run = spawnSync('bash', ['scripts/class-d-1000-final-acceptance.sh'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      TRUYN_CLASS_D1000_PREPARE_ONLY: '1',
      TRUYN_CLASS_D1000_NODES_PER_HOST: '10'
    }
  });

  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /TRUYN_CLASS_D1000_PREPARED_HARNESS=PASS/);
  assert.match(run.stdout, /strictNodesPerHost=50/);
  assert.doesNotMatch(run.stdout, /strictNodesPerHost=10/);
});
