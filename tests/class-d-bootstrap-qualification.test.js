import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Class D bootstrap qualification is a permanent exact-main D-500/D-1000 gate', async () => {
  const workflow = await readFile('.github/workflows/class-d-bootstrap-qualification.yml', 'utf8');
  const launcher = await readFile('.github/workflows/class-d-bootstrap-launcher.yml', 'utf8');
  const provision = await readFile('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');
  const service = await readFile('network/testnet/node-service.js', 'utf8');

  assert.match(workflow, /name: Class D Bootstrap Qualification/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /Class D Bootstrap Qualification Launcher/);
  assert.match(workflow, /source_sha:/);
  assert.match(workflow, /- d500/);
  assert.match(workflow, /- d1000/);
  assert.match(workflow, /NODES_PER_HOST=25/);
  assert.match(workflow, /NODES_PER_HOST=50/);
  assert.match(workflow, /\[\[ "\$main_sha" == "\$source_sha" \]\]/);
  assert.match(workflow, /\[\[ "\$GITHUB_SHA" == "\$source_sha" \]\]/);
  assert.match(workflow, /caller provenance/i);
  assert.match(workflow, /\.workflow_run\.head_repository\.id == \.repository\.id/);
  assert.match(workflow, /\.ahead_by==1/);
  assert.match(workflow, /\.files\|length\)==1/);
  assert.match(workflow, /bootstrap-launch\/\$\{source_sha:0:8\}-\$\{scale\}/);
  assert.match(workflow, /TRUYN_CLASS_D_BOOTSTRAP_QUALIFICATION_ONLY=1/);
  assert.match(workflow, /TRUYN_CLASS_D_BOOTSTRAP_TERMINAL/);
  assert.match(workflow, /BOOTSTRAP_HOSTS.*== 20/);

  assert.match(launcher, /name: Class D Bootstrap Qualification Launcher/);
  assert.match(launcher, /Validate exact immutable bootstrap request/);
  assert.match(launcher, /git rev-parse HEAD\^/);
  assert.match(launcher, /git rev-list --count/);
  assert.match(launcher, /git diff --name-only/);
  assert.doesNotMatch(launcher, /ORGANIZATION_AUTOPILOT_TOKEN_GITHUB/);
  assert.doesNotMatch(launcher, /gh workflow run/);
  assert.doesNotMatch(launcher, /actions: write/);
  assert.doesNotMatch(launcher, /id-token: write/);

  assert.match(provision, /targetConcurrency:4/);
  assert.match(provision, /timeoutMs:240000/);
  assert.match(provision, /--max-time 300/);
  assert.match(provision, /\.refreshed == true/);
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

test('qualification keeps full D-500 strict thresholds untouched', async () => {
  const workflow = await readFile('.github/workflows/d500-acceptance.yml', 'utf8');
  assert.match(workflow, /baselineSuccessRatio>=\.99/);
  assert.match(workflow, /postRestartSuccessRatio>=\.99/);
  assert.match(workflow, /healedSuccessRatio>=\.99/);
  assert.match(workflow, /recovery\.latencyMs\.p95<=120000/);
  assert.match(workflow, /acknowledgedWriteCount>=100/);
  assert.match(workflow, /acknowledgedWriteLossCount==0/);
});
