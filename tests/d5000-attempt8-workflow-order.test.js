import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const launcher = fs.readFileSync('.github/workflows/d5000-attempt8-approved.yml', 'utf8');

test('Attempt 8 installs QUIC runtime dependencies before all real-QUIC admission tests and before Azure login', () => {
  const setup = launcher.indexOf('uses: actions/setup-node@v4');
  const install = launcher.indexOf('- name: Install runtime dependencies');
  const admission = launcher.indexOf('- name: Verify exact-source admission');
  const realQuic = launcher.indexOf('node --test tests/p2p-generation-change-in-flight-need.test.js');
  const azure = launcher.indexOf('- uses: azure/login@v2');
  assert.ok(setup >= 0 && setup < install && install < admission && admission < realQuic && realQuic < azure);
  assert.equal((launcher.match(/- name: Install runtime dependencies/g) || []).length, 1);
  assert.match(launcher, /npm install --ignore-scripts --no-audit --no-fund/);
});

test('Attempt 8 is separately identified; previous attempt has verified no cloud dispatch', () => {
  assert.match(launcher, /attempt=8/);
  assert.match(launcher, /source_run=38056328064/);
  assert.match(launcher, /previous_no_azure=verified/);
  assert.match(launcher, /attempt7_no_azure_evidence_missing/);
  assert.match(launcher, /run_attempt/);
  assert.match(launcher, /GITHUB_RUN_ATTEMPT/);
  assert.match(launcher, /duplicate_attempt8_campaign/);
});

test('Attempt 8 keeps strict D-5000 evidence and cleanup contracts', () => {
  for (const marker of ['NODES_PER_HOST:', 'ack_count', 'ack_loss', 'remaining=0', 'class-d-5000-evidence.json', 'verify-class-d-5000-terminal.js', 'class-d-azure-5000-campaign.sh', 'd5000-post-restart-routing-stage.sh'])
    assert.ok(launcher.includes(marker), 'missing '+marker);
});
