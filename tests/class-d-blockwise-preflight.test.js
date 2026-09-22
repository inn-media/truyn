import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const blocks = [
  'B01_SOURCE_INTEGRITY','B02_BOOTSTRAP_REFRESH','B03_RUNTIME_BUNDLE','B04_NETWORK',
  'B05_REGRESSION','B06_SECURITY','B07_COMPONENT','B08_INTEGRATION','B09_SDK',
  'B10_FAST_GOVERNANCE','B11_CLASS_D_ACCEPTANCE','B12_WORKFLOW_CONTRACT'
];

test('Class-D blockwise preflight runs independent blocks in parallel and never fail-fast', async () => {
  const workflow = await readFile('.github/workflows/class-d-blockwise-preflight.yml', 'utf8');
  assert.match(workflow, /name: Class D Blockwise Preflight/);
  assert.match(workflow, /fail-fast: false/);
  for (const block of blocks) assert.ok(workflow.includes(block), `workflow missing ${block}`);
  assert.match(workflow, /continue-on-error: true/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /B99_AGGREGATE_FAILURE_REPORT/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.match(workflow, /Publish common failure report directly in Actions UI/);
});

test('each block emits rich low-overhead telemetry and a complete error ledger', async () => {
  const runner = await readFile('scripts/class-d-blockwise-preflight.mjs', 'utf8');
  for (const marker of [
    'console.log','events.jsonl','environment.txt','block.json','report.md','checksums.sha256','artifact-manifest.json',
    'harnessReturnCode','probeCompletion','redAssertions','errorClass','errorMessage','errorEventCount','durationMs','eventCounts',
    'runnerOs','runnerArch','runAttempt','git branch -vv','git remote -v','git status --short --branch','free -h','df -h','ulimit -a'
  ]) assert.ok(runner.includes(marker), `runner missing telemetry marker ${marker}`);
  assert.match(runner, /for \(let index = 0; index < block\.probes\.length; index \+= 1\)/);
  assert.match(runner, /process\.exitCode = status === 'GREEN' \? 0 : 1/);
});

test('aggregator produces UI-ready exhaustive RED and machine-readable reports', async () => {
  const aggregate = await readFile('scripts/class-d-blockwise-aggregate.mjs', 'utf8');
  for (const block of blocks) assert.ok(aggregate.includes(block), `aggregator missing ${block}`);
  for (const marker of ['summary.json','red-report.json','report.md','events.jsonl','checksums.sha256','artifact-manifest.json','redAssertions','errorLedger','probeCompletion','durations','eventCounts','sourceSha','expected','observed','probeId','errorClass','errorMessage']) {
    assert.ok(aggregate.includes(marker), `aggregator missing ${marker}`);
  }
  assert.match(aggregate, /TRUYN_CLASS_D_BLOCKWISE_TERMINAL/);
});

test('blockwise preflight does not weaken D-500 or bootstrap acceptance', async () => {
  const d500 = await readFile('.github/workflows/d500-acceptance.yml', 'utf8');
  const bootstrap = await readFile('.github/workflows/class-d-bootstrap-qualification.yml', 'utf8');
  assert.match(d500, /baselineSuccessRatio>=\.99/);
  assert.match(d500, /postRestartSuccessRatio>=\.99/);
  assert.match(d500, /healedSuccessRatio>=\.99/);
  assert.match(d500, /recovery\.latencyMs\.p95<=120000/);
  assert.match(d500, /acknowledgedWriteCount>=100/);
  assert.match(d500, /acknowledgedWriteLossCount==0/);
  assert.match(bootstrap, /TRUYN_CLASS_D_BOOTSTRAP_TERMINAL/);
});
