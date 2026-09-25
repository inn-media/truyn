import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/d-series-admission-gate.yml', 'utf8');

test('D-Series automatically re-runs only cheap Admission when main moves', () => {
  for (const marker of [
    'push:',
    'branches: [main]',
    "github.event_name == 'push'",
    'actions/workflows/d-series-frozen-candidate-qualification.yml/runs?status=success&per_page=100',
    'pulls?state=open&per_page=100',
    '.github/workflows/d*-acceptance.yml',
    'TESTED_COMMIT:',
    'controller_candidates',
    'active_candidates',
    'seen_candidates',
    'd-series-qualification-manifest-${candidate_run}',
    'gh run download',
    'no_controller_referenced_open_candidate',
    'ambiguous_controller_candidates',
    'controller_candidate_missing_qualification',
    'authority=current_acceptance_controller',
    'AUTO_RECHECK',
    "if: steps.q.outputs.eligible == 'true'",
    'd-series-qualification-manifest.mjs admission',
    '.decision.targetedBlocks[]?',
    'main_moved_during_admission'
  ]) assert.ok(workflow.includes(marker), marker);

  assert.ok(!workflow.includes('workflow_dispatch d-series-blockwise-preflight'));
  assert.ok(!workflow.includes('workflow_dispatch d200-bug-hunt'));
  assert.ok(!workflow.includes('automatic full rerun'));
});

test('automatic main-movement Admission is fail-closed and ignores arbitrary qualified PR heads', () => {
  assert.match(workflow, /TESTED_COMMIT/);
  assert.match(workflow, /controller_candidates/);
  assert.match(workflow, /active_candidates/);
  assert.match(workflow, /seen_candidates/);
  assert.match(workflow, /\[\[ "\$candidate" == "\$head" \]\]/);
  assert.match(workflow, /target_candidate/);
  assert.match(workflow, /matched_run/);
  assert.match(workflow, /\.expired==false/);
  assert.match(workflow, /\.run_attempt==1/);
  assert.match(workflow, /length==1/);
  assert.match(workflow, /exit 23/);
  assert.match(workflow, /exit 24/);
  assert.match(workflow, /pull-requests: read/);
  assert.ok(!workflow.includes('ambiguous_active_qualifications'));
});
