import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('current D-Series qualification and D-500 launcher are exact-SHA and single-shot', async () => {
  const qualification = await readFile('.github/workflows/d-series-frozen-candidate-qualification.yml', 'utf8');
  const admission = await readFile('.github/workflows/d-series-admission-gate.yml', 'utf8');
  const d500 = await readFile('.github/workflows/d500-scale-run.yml', 'utf8');
  const provision = await readFile('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');
  const service = await readFile('network/testnet/node-service.js', 'utf8');

  assert.match(qualification, /name: D-Series Frozen Candidate Qualification/);
  assert.match(qualification, /workflow_dispatch:/);
  assert.match(qualification, /workflow_run:/);
  assert.match(qualification, /D-Series Sanitation Swarm/);
  assert.match(qualification, /D-Series Blockwise Preflight/);
  assert.match(qualification, /candidate_sha:/);
  assert.match(qualification, /.head_sha // empty/);
  assert.match(qualification, /.head_commit.id // .head_sha/);
  assert.match(qualification, /.run_attempt==1/);
  assert.match(qualification, /d-series-qualification-manifest-/);
  assert.match(qualification, /candidate_bound_pair_not_ready/);

  assert.match(admission, /name: D-Series Admission Gate/);
  assert.match(admission, /ref: main/);
  assert.match(admission, /current_main/);
  assert.match(admission, /integration_tree/);
  assert.match(admission, /main_moved_during_admission/);
  assert.match(admission, /PASS_COMPATIBLE/);

  assert.match(d500, /name: D-500 Scale Run/);
  assert.match(d500, /branches: [main]/);
  assert.match(d500, /paths: ['.github/d500/launch-19.txt']/);
  assert.match(d500, /truyn-d500-attempt19-single-shot/);
  assert.match(d500, /TESTED_COMMIT: [0-9a-f]{40}/);
  assert.match(d500, /EXACT_MAIN_CI_RUN: '[0-9]+'/);
  assert.match(d500, /EXACT_MAIN_FIVE_PATCH_RUN: '[0-9]+'/);
  assert.match(d500, /NODES_PER_HOST: '25'/);
  assert.match(d500, /Execute real 20-host 500-process campaign/);
  assert.doesNotMatch(d500, /workflow_dispatch:/);
  assert.doesNotMatch(d500, /launch-20.txt/);

  assert.match(provision, /targetConcurrency:4/);
  assert.match(provision, /timeoutMs:240000/);
  assert.match(provision, /--max-time 300/);
  assert.match(provision, /.refreshed == true/);
  assert.match(provision, /TRUYN_CLASS_D_BOOTSTRAP_QUALIFICATION/);
  assert.match(provision, /TRUYN_CLASS_D_BOOTSTRAP_QUALIFICATION_ONLY/);

  assert.match(service, /dhtRefreshInFlight/);
  assert.match(service, /dhtRefreshInFlightKey/);
  assert.match(service, /TRUYN_DHT_REFRESH_IN_FLIGHT/);
  assert.match(service, /targetConcurrency/);
  assert.match(service, /timeoutMs/);
});

test('bootstrap-only exit is after bootstrap and before full Class-D stages', async () => {
  const provision = await readFile('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');
  const bootstrapStage = provision.indexOf('STAGE=bootstrap');
  const qualificationMarker = provision.indexOf('TRUYN_CLASS_D_BOOTSTRAP_QUALIFICATION class=');
  const bandwidthStage = provision.indexOf('STAGE=bandwidth-meter');

  assert.ok(bootstrapStage >= 0);
  assert.ok(qualificationMarker > bootstrapStage);
  assert.ok(bandwidthStage > qualificationMarker);
  assert.match(provision, /return 0 2>\/dev\/null \|\| exit 0/);
});

test('current D-500 launcher keeps strict acceptance thresholds untouched', async () => {
  const workflow = await readFile('.github/workflows/d500-scale-run.yml', 'utf8');
  assert.match(workflow, /baselineSuccessRatio>=\.99/);
  assert.match(workflow, /postRestartSuccessRatio>=\.99/);
  assert.match(workflow, /healedSuccessRatio>=\.99/);
  assert.match(workflow, /convergence\.routingSuccessRatio>=\.99/);
  assert.match(workflow, /recovery\.latencyMs\.p95<=120000/);
  assert.match(workflow, /packetPartitionRecoveryMs<=120000/);
  assert.match(workflow, /\.safety\.acknowledgedWriteCount==100/);
  assert.match(workflow, /\.safety\.acknowledgedWriteLossCount==0/);
  assert.match(workflow, /\.cleanup\.confirmed==true/);
  assert.match(workflow, /\.cleanup\.remainingResources==0/);
});
