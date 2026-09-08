import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 readiness window tolerates transient control-plane misses without weakening acceptance', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-readiness-window-'));
  const target = join(dir, 'campaign.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-campaign.sh', target);
  const before = await readFile(target, 'utf8');
  const afterReadiness = before.slice(before.indexOf('STAGE=convergence'));

  let run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-readiness-parallel.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-readiness-window.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);

  const value = await readFile(target, 'utf8');
  const start = value.indexOf('STAGE=readiness-barrier');
  const end = value.indexOf('STAGE=convergence');
  assert.ok(start >= 0 && end > start);
  const block = value.slice(start, end);

  assert.ok(block.includes('D200_READINESS_WINDOW_HARDENED=1'));
  assert.equal(block.split('deadline=\\$((\\$(date +%s) + 120))').length - 1, 1, 'exactly one readiness window remains');
  assert.ok(block.includes('readiness_remaining=\\$((deadline - readiness_now))'), 'every node probe must derive the remaining bounded deadline');
  assert.ok(block.includes('readiness_probe_timeout=\\$readiness_remaining'));
  assert.ok(block.includes('if [[ "\\$readiness_probe_timeout" -gt 10 ]]'));
  assert.ok(block.includes('if readiness=\\$(curl -fsS --max-time "\\$readiness_probe_timeout"'), 'curl must be guarded and capped to the remaining deadline');
  assert.ok(block.includes('if [[ "\\$(date +%s)" -ge "\\$deadline" ]]'), 'late probe completion must not authorize readiness');
  assert.equal(block.includes('\n    readiness=\\$(curl -fsS --max-time 10'), false, 'unguarded readiness curl is forbidden');
  assert.ok(block.includes('readiness_curl_failures=\\$((readiness_curl_failures + 1))'));
  assert.ok(block.includes('readiness_parse_failures=\\$((readiness_parse_failures + 1))'));
  assert.ok(block.includes('readiness_predicate_failures=\\$((readiness_predicate_failures + 1))'));
  assert.ok(block.includes('continue'), 'transient misses stay inside the same bounded observation window');
  assert.ok(block.includes('READINESS_CURL_FAILURES='));
  assert.ok(block.includes('READINESS_PARSE_FAILURES='));
  assert.ok(block.includes('READINESS_PREDICATE_FAILURES='));
  for (const marker of [
    'READINESS_LAST_FAILURE_NODE=',
    'READINESS_LAST_FAILURE_KIND=',
    'READINESS_LAST_STATUS=',
    'READINESS_LAST_PROPAGATION_READY=',
    'READINESS_LAST_PENDING=',
    'READINESS_LAST_VALID=',
    'READINESS_LAST_BUCKETS=',
    'READINESS_LAST_HOSTS=',
  ]) assert.ok(block.includes(marker), `missing timeout evidence marker ${marker}`);
  assert.ok(block.includes('TRUYN_D200_READINESS_GATE_FAILURE'), 'persistent failure must become actionable evidence');
  assert.ok(block.includes('predicateFailures=${predicate_failures:-unknown}'));
  assert.ok(block.includes('lastPending=${last_pending:-unknown}'));
  assert.ok(block.includes('lastValid=${last_valid:-unknown}'));
  assert.ok(block.includes('lastHosts=${last_hosts:-unknown}'));

  const markerIndex = block.indexOf('echo READINESS_CURL_FAILURES=');
  const guestAssertIndex = block.lastIndexOf('[[ "\\$ready" -eq ${NODES_PER_HOST} ]]');
  assert.ok(markerIndex >= 0 && guestAssertIndex > markerIndex, 'failure markers must be published before the terminal guest assertion');

  const curlFailure = block.slice(block.indexOf('readiness_last_failure_kind=curl'), block.indexOf('if [[ "\\$(date +%s)" -ge "\\$deadline" ]]'));
  for (const reset of [
    'readiness_last_status=unknown',
    'readiness_last_propagation_ready=unknown',
    'readiness_last_pending=-1',
    'readiness_last_valid=-1',
    'readiness_last_buckets=-1',
    'readiness_last_hosts=-1',
  ]) assert.ok(curlFailure.includes(reset), `curl failure must clear stale semantic evidence: ${reset}`);

  assert.ok(block.includes('.acceptanceReady == true and .peerRecordPropagation.ready == true'));
  assert.ok(block.includes('.peerRecordPropagation.pendingCount // -1'));
  assert.ok(block.includes('"\\$valid" -ge ${BOOTSTRAP_MAX_PEERS_PER_NODE}'));
  assert.ok(block.includes('"\\$buckets" -gt 0'));
  assert.ok(block.includes('"\\$hosts" -eq ${HOST_COUNT}'));
  assert.equal(block.includes('/need'), false);
  assert.equal(value.slice(value.indexOf('STAGE=convergence')), afterReadiness, 'all later acceptance stages remain byte-identical');

  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-readiness-window.py', target], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'patch must fail closed when applied twice');
});
