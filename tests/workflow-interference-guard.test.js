import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWorkflowRun, classifyWorkflowRuns } from '../scripts/workflow-interference-guard.mjs';

const NOW = Date.parse('2026-09-23T20:00:00Z');
const CURRENT_SHA = '5a1eeebc181d5b7d87424fb2959a370149d51cb5';
const MATERIAL = ['.github/workflows/ci.yml', '.github/workflows/d500-acceptance.yml'];
const BASE_OPTIONS = {
  nowMs: NOW,
  currentSha: CURRENT_SHA,
  campaignShas: [CURRENT_SHA],
  materialWorkflowPaths: MATERIAL,
  freshnessMs: 6 * 60 * 60 * 1000
};

test('historical queued run with old SHA and zero liveness/evidence is orphaned stale, not interference', () => {
  const result = classifyWorkflowRun({
    id: 32558383377,
    status: 'queued',
    head_sha: '23360cbe86e725f79ef0c6772a51f70825b92aef',
    path: '.github/workflows/ci.yml',
    created_at: '2026-08-22T06:59:09Z',
    jobs_count: 0,
    artifacts_count: 0
  }, BASE_OPTIONS);

  assert.equal(result.classification, 'ORPHANED_STALE');
  assert.equal(result.blocking, false);
});

test('fresh materially overlapping run on exact current SHA remains blocking', () => {
  const result = classifyWorkflowRun({
    id: 40000000001,
    status: 'queued',
    head_sha: CURRENT_SHA,
    path: '.github/workflows/d500-acceptance.yml',
    created_at: '2026-09-23T19:55:00Z',
    jobs_count: 0,
    artifacts_count: 0
  }, BASE_OPTIONS);

  assert.equal(result.classification, 'ACTIVE_CURRENT_CAMPAIGN_INTERFERENCE');
  assert.equal(result.blocking, true);
});

test('fresh cross-campaign run sharing a material resource remains blocking', () => {
  const result = classifyWorkflowRun({
    id: 40000000002,
    status: 'in_progress',
    head_sha: '1111111111111111111111111111111111111111',
    path: '.github/workflows/d500-acceptance.yml',
    created_at: '2026-09-23T19:45:00Z',
    jobs_count: 1,
    artifacts_count: 0
  }, BASE_OPTIONS);

  assert.equal(result.classification, 'ACTIVE_CROSS_CAMPAIGN_INTERFERENCE');
  assert.equal(result.blocking, true);
});

test('stale different-SHA run without liveness enrichment fails closed', () => {
  const result = classifyWorkflowRun({
    id: 40000000003,
    status: 'queued',
    head_sha: '2222222222222222222222222222222222222222',
    path: '.github/workflows/ci.yml',
    created_at: '2026-08-20T00:00:00Z'
  }, BASE_OPTIONS);

  assert.equal(result.classification, 'STALE_UNVERIFIED_LIVENESS');
  assert.equal(result.blocking, true);
});

test('unrelated queued workflow is not treated as interference merely because it is queued', () => {
  const result = classifyWorkflowRun({
    id: 40000000004,
    status: 'queued',
    head_sha: CURRENT_SHA,
    path: '.github/workflows/publish-npm.yml',
    created_at: '2026-09-23T19:58:00Z',
    jobs_count: 0,
    artifacts_count: 0
  }, BASE_OPTIONS);

  assert.equal(result.classification, 'IGNORED_NO_SHARED_RESOURCE_OVERLAP');
  assert.equal(result.blocking, false);
});

test('aggregate guard blocks only when at least one materially active run remains', () => {
  const result = classifyWorkflowRuns([
    {
      id: 32558383377,
      status: 'queued',
      head_sha: '23360cbe86e725f79ef0c6772a51f70825b92aef',
      path: '.github/workflows/ci.yml',
      created_at: '2026-08-22T06:59:09Z',
      jobs_count: 0,
      artifacts_count: 0
    },
    {
      id: 40000000005,
      status: 'completed',
      conclusion: 'success',
      head_sha: CURRENT_SHA,
      path: '.github/workflows/d500-acceptance.yml',
      created_at: '2026-09-23T19:00:00Z',
      jobs_count: 1,
      artifacts_count: 1
    }
  ], BASE_OPTIONS);

  assert.equal(result.blocking, false);
  assert.deepEqual(result.decisions.map((item) => item.classification), [
    'ORPHANED_STALE',
    'IGNORED_TERMINAL_OR_INACTIVE'
  ]);
});
