import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = readFileSync('benchmarks/scale/d5000-post-restart-routing-stage.sh', 'utf8');
const anchor = 'for pid in "${obs_pids[@]}"; do wait "$pid" || true; done\n\n';
const start = source.indexOf(anchor);
assert.ok(start >= 0, 'must retain observation-wait boundary');
const rest = source.slice(start + anchor.length);
const end = rest.indexOf('\nrm -rf "$post_dir"');
assert.ok(end > 0, 'must retain evidence assembly and cleanup boundary');
const evidenceLoop = rest.slice(0, end);

function executeAssembly({ failed = false, observation = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'd5000-post-evidence-'));
  try {
    const good = (host) => ({
      schema: 'truyn.d5000.post-restart-origin.host.v3',
      host, firstAttempt: { success: 5, total: 5 }, failures: [],
      acceptanceUsesFirstAttemptOnly: true, applicationRetryCount: 0,
    });
    const sourceRow = good(0);
    if (failed) {
      sourceRow.firstAttempt.success = 4;
      sourceRow.failures = [{ targetNodeId: 'target-5', targetLocalNode: 5, ok: false }];
    }
    writeFileSync(join(dir, '0.json'), JSON.stringify(sourceRow) + '\n');
    writeFileSync(join(dir, '1.json'), JSON.stringify(good(1)) + '\n');
    if (observation !== null) {
      writeFileSync(join(dir, 'target-1.out'),
        'POST_TARGET_JSON=' + JSON.stringify(observation) + '\n');
    }
    const shell = [
      'set -Eeuo pipefail',
      'HOST_COUNT=2',
      'post_dir="$1"',
      'post_jsonl="$post_dir/assembled.jsonl"',
      ': >"$post_jsonl"',
      'declare -A post_failed_targets=()',
      ...(failed ? ['post_failed_targets[1]="5"'] : []),
      evidenceLoop,
      'cat "$post_jsonl"',
    ].join('\n');
    const run = spawnSync('bash', ['-c', shell, 'd5000-evidence', dir],
      { encoding: 'utf8', timeout: 15000 });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const rows = run.stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(rows.length, 2);
    return rows;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('100% first-attempt success: no optional target files and evidence remains complete', () => {
  const rows = executeAssembly();
  assert.deepEqual(rows.map(row => row.firstAttempt.success), [5, 5]);
  assert.deepEqual(rows.map(row => row.failures.length), [0, 0]);
  assert.ok(rows.every(row => !('targetObservations' in row)));
});

test('failed first-attempt: retain failure and attach available target diagnostics', () => {
  const observations = { '5': { observedOnHost: 1, readinessObserved: true } };
  const rows = executeAssembly({ failed: true, observation: observations });
  assert.equal(rows[0].firstAttempt.success, 4);
  assert.equal(rows[0].failures.length, 1);
  assert.deepEqual(rows[0].targetObservations, observations);
  assert.equal(rows[1].firstAttempt.success, 5);
});

test('failed first-attempt: missing diagnostics are recorded, never promoted to PASS', () => {
  const rows = executeAssembly({ failed: true });
  assert.equal(rows[0].firstAttempt.success, 4);
  assert.equal(rows[0].failures.length, 1);
  assert.deepEqual(rows[0].targetObservations, { observationUnavailable: true });
});
