import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');

test('Sanitation Swarm remains the primary D-Series engine and consumes Blockwise domains', () => {
  const workflow = read('.github/workflows/d200-bug-hunt.yml');
  const docs = read('docs/operations/class-d/D_SERIES_SANITATION_SWARM.md');
  for (const marker of [
    'name: D-Series Sanitation Swarm',
    'scripts/class-d-stage-runner.mjs',
    'scripts/d-series-block-runner.mjs',
    'fail-fast: false',
    'd-series-swarm-aggregate.mjs',
    'd200-bug-hunt-aggregate.mjs'
  ]) assert.ok(workflow.includes(marker), `Swarm workflow lost marker: ${marker}`);
  assert.ok(docs.includes('Sanitation / Swarm is the primary D-Series diagnostic and repair engine'));
  assert.ok(docs.includes('Blockwise B01-B16 is subordinate to it'));
});

test('full Blockwise admission is impossible without exact-SHA GREEN Swarm provenance', () => {
  const workflow = read('.github/workflows/d-series-blockwise-preflight.yml');
  const verifier = read('scripts/verify-d-series-blockwise-preflight-run.sh');
  for (const marker of [
    'swarm_run_id:',
    'Require clean Swarm before full admission',
    'scripts/verify-d-series-swarm-run.sh',
    'd-series-blockwise-admission-${{ github.run_id }}'
  ]) assert.ok(workflow.includes(marker), `Blockwise admission lost marker: ${marker}`);
  assert.ok(!workflow.includes('push:\n    branches: [main]'), 'Blockwise must not race Swarm as an automatic main push admission');
  assert.ok(verifier.includes('.event == "workflow_dispatch"'));
  assert.ok(verifier.includes('d-series-blockwise-admission-${RUN_ID}'));
  assert.ok(verifier.includes('swarm_provenance=true'));
});

test('Swarm verifier binds admission evidence to exact main and requested scale', () => {
  const verifier = read('scripts/verify-d-series-swarm-run.sh');
  for (const marker of [
    '.name == "D-Series Sanitation Swarm"',
    '.head_branch == "main"',
    '.head_sha == $source',
    '.event == "workflow_dispatch"',
    'd-series-swarm-summary-${EXPECTED_SCALE}-${RUN_ID}',
    'd-series-swarm-summary-all-${RUN_ID}'
  ]) assert.ok(verifier.includes(marker), `Swarm verifier lost marker: ${marker}`);
});

test('Swarm aggregate is fail-closed and deduplicates failure fingerprints', () => {
  const aggregate = read('scripts/d-series-swarm-aggregate.mjs');
  for (const marker of [
    "schema: 'truyn.d-series.sanitation-swarm.v1'",
    'rootCauseCount',
    'rootCauses',
    "primaryEngine: 'sanitation-swarm'",
    'if (enforce && !clean) process.exitCode = 1'
  ]) assert.ok(aggregate.includes(marker), `Swarm aggregate lost marker: ${marker}`);
});
