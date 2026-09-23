import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync('config/d-series-blockwise-preflight.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/d-series-blockwise-preflight.yml', 'utf8');
const runner = fs.readFileSync('scripts/d-series-block-runner.mjs', 'utf8');
const aggregate = fs.readFileSync('scripts/d-series-block-aggregate.mjs', 'utf8');
const verifier = fs.readFileSync('scripts/verify-d-series-blockwise-preflight-run.sh', 'utf8');

test('D-Series permanently defines exactly sixteen independently testable blocks', () => {
  assert.equal(config.schema, 'truyn.d-series.blockwise-preflight.v1');
  assert.deepEqual(config.classes, [200, 500, 1000]);
  const expected = Array.from({ length: 16 }, (_, i) => `B${String(i + 1).padStart(2, '0')}`);
  assert.deepEqual(config.blocks.map((block) => block.id), expected);
  assert.equal(new Set(config.blocks.map((block) => block.id)).size, 16);
  for (const block of config.blocks) assert.ok(Array.isArray(block.commands) && block.commands.length > 0, block.id);
});

test('B06 is the permanent isolated bootstrap qualification block', () => {
  const block = config.blocks.find((candidate) => candidate.id === 'B06');
  assert.equal(block.name, 'bootstrap-refresh');
  assert.equal(block.liveQualification, 'class-d-bootstrap-qualification.yml');
  const joined = JSON.stringify(block);
  assert.match(joined, /peer-discovery-refresh-bounds/);
  assert.match(joined, /class-d-bootstrap-qualification/);
});

test('blockwise workflow runs all blocks in parallel without fail-fast and supports targeted repair', () => {
  assert.match(workflow, /name: D-Series Blockwise Preflight/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /push:\s*\n\s*branches: \[main\]/);
  assert.match(workflow, /swarm_run_id:/);
  assert.match(workflow, /Require clean Swarm before full admission/);
  assert.match(workflow, /verify-d-series-swarm-run\.sh/);
  assert.match(workflow, /fail-fast: false/);
  for (let i = 1; i <= 16; i += 1) assert.match(workflow, new RegExp(`B${String(i).padStart(2, '0')}`));
  assert.match(workflow, /Run complete block cycle and retain all failures/);
  assert.match(workflow, /--scope targeted --selected-block/);
  assert.match(workflow, /--scope full --enforce/);
  assert.match(workflow, /main_sha.*SOURCE_SHA/s);
});

test('block runners retain failures while the aggregate alone fails closed', () => {
  assert.match(runner, /Deliberately return zero/);
  assert.match(runner, /process\.exitCode = 0/);
  assert.match(aggregate, /expectedBlocks = Array\.from\(\{ length: 16 \}/);
  assert.match(aggregate, /TRUYN_D_SERIES_BLOCKWISE_TERMINAL/);
  assert.match(aggregate, /if \(enforce && !clean\) process\.exitCode = 1/);
});

test('full launch gate accepts only exact-main successful manual admission with Swarm provenance', () => {
  assert.match(verifier, /D-Series Blockwise Preflight/);
  assert.match(verifier, /\.head_branch == "main"/);
  assert.match(verifier, /\.head_sha == \$source/);
  assert.match(verifier, /\.event == "workflow_dispatch"/);
  assert.match(verifier, /\.conclusion == "success"/);
  assert.match(verifier, /\.run_attempt == 1/);
  assert.match(verifier, /d-series-blockwise-summary-/);
  assert.match(verifier, /d-series-blockwise-admission-/);
  assert.match(verifier, /blocks=16\/16/);
  assert.match(verifier, /swarm_provenance=true/);
});

test('future D-500 and live D-1000 entrypoints enforce the exact blockwise preflight', () => {
  const d500Template = fs.readFileSync('.github/d500/d500-acceptance.template.yml', 'utf8');
  const d1000 = fs.readFileSync('scripts/class-d-1000-final-acceptance.sh', 'utf8');
  assert.match(d500Template, /D_SERIES_BLOCKWISE_PREFLIGHT_RUN: '__D_SERIES_BLOCKWISE_PREFLIGHT_RUN__'/);
  assert.match(d500Template, /verify-d-series-blockwise-preflight-run\.sh "\$TESTED_COMMIT"/);
  assert.match(d500Template, /value D_SERIES_BLOCKWISE_PREFLIGHT_RUN/);
  assert.match(d1000, /verify-d-series-blockwise-preflight-run\.sh/);
  const prepareOnly = d1000.indexOf('TRUYN_CLASS_D1000_PREPARE_ONLY');
  const launchGate = d1000.indexOf('verify-d-series-blockwise-preflight-run.sh');
  const provision = d1000.indexOf('source "$TMP/provision.sh"');
  assert.ok(prepareOnly >= 0 && launchGate > prepareOnly && provision > launchGate);
});

test('blockwise preflight does not weaken D-500 acceptance thresholds', () => {
  const d500 = fs.readFileSync('.github/workflows/d500-acceptance.yml', 'utf8');
  assert.match(d500, /baselineSuccessRatio>=\.99/);
  assert.match(d500, /postRestartSuccessRatio>=\.99/);
  assert.match(d500, /healedSuccessRatio>=\.99/);
  assert.match(d500, /recovery\.latencyMs\.p95<=120000/);
  assert.match(d500, /acknowledgedWriteCount>=100/);
  assert.match(d500, /acknowledgedWriteLossCount==0/);
});
