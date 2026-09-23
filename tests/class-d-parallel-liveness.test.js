import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('Class-D canonical provisioner uses parallel host barriers and bounded parallel node refresh', async () => {
  const provision = await read('benchmarks/scale/class-d-azure-1000-provision.sh');
  const provisionStage = provision.slice(provision.indexOf('STAGE=provision'), provision.indexOf('STAGE=install'));
  const installStage = provision.slice(provision.indexOf('STAGE=install'), provision.indexOf('STAGE=bootstrap-record-refresh'));
  const bootstrapStage = provision.slice(provision.indexOf('STAGE=bootstrap\n'), provision.indexOf('STAGE=bandwidth-meter'));

  assert.match(provisionStage, /provision_pids=\(\)/);
  assert.match(provisionStage, /class_d_wait_barrier provision/);
  assert.match(installStage, /install_pids=\(\)/);
  assert.match(installStage, /class_d_wait_barrier install/);
  assert.match(provision, /class_d_wait_barrier bootstrap-record-refresh/);
  assert.match(bootstrapStage, /BOOTSTRAP_NODE_PARALLELISM/);
  assert.match(bootstrapStage, /node_refresh_pids=\(\)/);
  assert.match(bootstrapStage, /bootstrap_refresh_node/);
  assert.match(bootstrapStage, /class_d_wait_barrier bootstrap/);
  assert.match(provision, /class_d_phase_deadline_seconds cleanup/);
});

test('Class-D phase deadlines preserve requested future D-500 and D-1000 outer watchdogs', async () => {
  const deadlines = await read('scripts/lib/class-d-phase-deadlines.sh');
  const strictD1000 = await read('scripts/class-d-1000-strict-acceptance.sh');
  const d500Template = await read('.github/d500/d500-acceptance.template.yml');
  const orchestrator = await read('scripts/d200-stage-isolated-campaign.sh');

  assert.match(deadlines, /D-500\) printf '%s\\n' 120/);
  assert.match(deadlines, /D-1000\) printf '%s\\n' 240/);
  for (const family of ['bootstrap', 'topology', 'baseline', 'restart', 'recovery', 'adversarial', 'cleanup']) {
    assert.ok(deadlines.includes(family), `missing phase family ${family}`);
  }
  assert.match(strictD1000, /timeout --signal=TERM --kill-after=300s 240m/);
  assert.match(d500Template, /timeout-minutes: 120/);
  assert.match(orchestrator, /class_d_phase_deadline_seconds/);
  assert.match(orchestrator, /TRUYN_CLASS_D_PHASE_DEADLINE/);
});

test('Liveness deadlines do not weaken canonical Class-D correctness thresholds', async () => {
  const campaign = await read('benchmarks/scale/class-d-azure-1000-campaign.sh');
  const d500 = await read('.github/workflows/d500-acceptance.yml');

  assert.match(campaign, /assert float\('\$conv_rate'\) >= \.99/);
  assert.match(campaign, /assert float\('\$conv_p95'\) <= 120000/);
  assert.match(d500, /baselineSuccessRatio>=\.99/);
  assert.match(d500, /postRestartSuccessRatio>=\.99/);
  assert.match(d500, /healedSuccessRatio>=\.99/);
  assert.match(d500, /p95<=120000/);
  assert.match(d500, /acknowledgedWriteLossCount==0/);
  assert.match(d500, /invalidSignedStateAcceptedCount==0/);
  assert.match(d500, /staleRevokedReceiptAcceptedCount==0/);
  assert.match(d500, /unauthorizedProviderExecutionCount==0/);
});
