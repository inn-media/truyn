import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 post-restart origin patch preserves first-attempt acceptance and adds read-only failure evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-post-restart-origin-'));
  const target = join(dir, 'campaign.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-campaign.sh', target);
  const before = await readFile(target, 'utf8');
  const start = before.indexOf('STAGE=post-restart-routing');
  const end = before.indexOf('STAGE=packet-partition');
  assert.ok(start >= 0 && end > start, 'expected post-restart block');
  const prefix = before.slice(0, start);
  const suffix = before.slice(end);

  const run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-post-restart-origin.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);

  let after = await readFile(target, 'utf8');
  const patchedStart = after.indexOf('STAGE=post-restart-routing');
  const patchedEnd = after.indexOf('STAGE=packet-partition');
  const block = after.slice(patchedStart, patchedEnd);
  assert.equal(after.slice(0, patchedStart), prefix, 'stages before post-restart routing must remain byte-identical');
  assert.equal(after.slice(patchedEnd), suffix, 'stages after post-restart routing must remain byte-identical');

  assert.ok(block.includes('D200_POST_RESTART_ORIGIN_DIAG=1'));
  assert.ok(block.includes('class-d-200-post-restart-origin.json'));
  assert.ok(block.includes('class-d-200-post-restart-origin.jsonl'));
  assert.ok(block.includes('class-d-200-post-restart-origin-digest.txt'));
  assert.ok(block.includes("'schema':'truyn.d200.post-restart-origin.v1'"));
  assert.ok(block.includes("'acceptanceUsesFirstAttemptOnly':True"));
  assert.ok(block.includes("'applicationRetryCount':0"));
  assert.ok(block.includes('applicationRetries=0'));

  assert.equal((block.match(/\/need/g) || []).length, 1, 'post-restart diagnostics must contain exactly one application NEED call site');
  assert.equal(block.includes('production-recovery-retry'), false, 'post-restart diagnostics must never retry application work');
  assert.equal(block.includes('diagnosticRetry'), false, 'post-restart evidence must remain read-only after the first application attempt');
  assert.ok(block.includes("'scenario':'d1000-post-restart'"), 'canonical post-restart scenario must remain first attempt');
  assert.ok(block.includes("'--max-time','15'"), 'first application timeout must remain unchanged');
  assert.ok(block.includes("assert float('$post_rate') >= .99, '$post_rate'"), 'post-restart acceptance must remain >=99%');
  assert.ok(block.includes("'firstAttempt':first"));
  assert.ok(block.includes("'sourceBefore':source_before"));
  assert.ok(block.includes("'peerRecordBefore':peer_before"));
  assert.ok(block.includes("'sourceAfter':source_state()"));
  assert.ok(block.includes("'peerRecordAfter':persisted_peer_state(node_id)"));
  assert.ok(block.includes("'targetReadinessObservedAfterFirstAttempt'"));
  assert.ok(block.includes("'acceptanceReady':value.get('acceptanceReady')"));
  assert.ok(block.includes("'peerRecordPropagationReady':propagation.get('ready')"));
  assert.ok(block.includes("'acknowledgedCount':propagation.get('acknowledgedCount')"));
  assert.ok(block.includes("'pendingCount':propagation.get('pendingCount')"));
  assert.ok(block.includes("'validPeers':routing.get('validPeers')"));
  assert.ok(block.includes("'populatedBuckets':routing.get('populatedBuckets')"));
  assert.ok(block.includes("'remoteHostCount':(value.get('remoteEndpointDiversity') or {}).get('hostCount')"));

  for (const classification of [
    'target-propagation-not-ready',
    'source-missing-target-record',
    'source-has-stale-target-record',
    'valid-record-present-but-direct-route-failed',
  ]) {
    assert.ok(block.includes(classification), `expected classification ${classification}`);
  }

  assert.equal(block.includes('/dht/refresh'), false, 'diagnostics must not precondition post-restart routing with refresh');
  assert.equal(block.includes('TRUYN_PEER_RECORD_TTL_MS'), false, 'diagnostics must not alter peer-record TTL');
  assert.equal(block.includes('routeAttemptTimeoutMs'), false, 'diagnostics must not alter production route timeout');
  assert.equal(block.includes('allowRelayFallback'), false, 'diagnostics must not broaden relay fallback');
  assert.equal(block.includes('sleep '), false, 'diagnostic evidence collection must not add benchmark recovery waiting');

  // Next D-200 launcher normalizes exactly the same restarted target range.
  assert.equal((after.match(/range\(10,15\)/g) || []).length, 1, 'post-restart target range must remain exactly one normalization site');
  after = after.replaceAll('range(10,15)', 'range(5,10)');
  const d200Block = after.slice(after.indexOf('STAGE=post-restart-routing'), after.indexOf('STAGE=packet-partition'));
  assert.equal((d200Block.match(/range\(5,10\)/g) || []).length, 1);
  assert.equal(d200Block.includes('range(10,15)'), false);
  assert.equal((d200Block.match(/\/need/g) || []).length, 1, 'D-200 normalized diagnostics must still have one application call site');
  assert.ok(d200Block.includes("assert float('$post_rate') >= .99, '$post_rate'"));

  const shell = spawnSync('bash', ['-n', target], { encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr || shell.stdout);

  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-post-restart-origin.py', target], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'patch must fail closed when applied twice');
});
