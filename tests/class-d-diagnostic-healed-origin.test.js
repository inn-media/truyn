import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 healed origin diagnostics distinguish peer-record freshness from cached transport without weakening acceptance', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-healed-origin-'));
  const target = join(dir, 'campaign.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-campaign.sh', target);

  const first = spawnSync('python3', ['scripts/patch-class-d-diagnostic-healed-reconvergence.py', target], { encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-healed-origin.py', target], { encoding: 'utf8' });
  assert.equal(second.status, 0, second.stderr || second.stdout);

  const after = await readFile(target, 'utf8');
  const healedStart = after.indexOf('STAGE=healed-routing');
  const retentionStart = after.indexOf('STAGE=write-retention');
  assert.ok(healedStart >= 0 && retentionStart > healedStart, 'expected bounded healed-routing block');
  const block = after.slice(healedStart, retentionStart);

  assert.ok(block.includes("first=need(j,node_id,'d1000-healed',k,'first')"), 'canonical first attempt must remain the acceptance probe');
  assert.ok(block.includes("'--max-time','15'"), 'first attempt must retain the 15-second request timeout');
  assert.ok(block.includes('success=sum(ok for ok,_,_ in rows)'), 'acceptance success must count only first attempts');
  assert.ok(block.includes("assert float('$healed_rate') >= .99, '$healed_rate'"), 'strict healed routing threshold must remain 99%');

  assert.ok(block.includes("path=f'/var/lib/truyqn-d1000/node-{global_index}-state.json'"), 'diagnostics must read the actual persisted node state path');
  assert.ok(block.includes("'peerRecordBeforeFirstAttempt':peer_before"), 'target peer-record state must be captured before recovery actions');
  assert.ok(block.includes("'peerRecordAfterTimeout':peer_after_timeout"), 'post-timeout record transition must be captured');
  assert.ok(block.includes("if peer_before.get('validNow') is True:"), 'classifier must branch on pre-first-attempt record freshness');

  assert.ok(block.includes("control+'/faults/partition'"), 'valid-record failures must use the existing bounded fault control to discard cached target clients');
  assert.ok(block.includes("control+'/faults/heal'"), 'forced target transport reset must always heal the temporary diagnostic fault');
  assert.ok(block.includes("d1000-healed-session-reset-retry"), 'valid-record transport recovery must be measured separately');
  assert.ok(block.includes("classification='valid-record-session-reset-recovered'"), 'transport/session recovery must have an explicit class');

  assert.ok(block.includes("refresh=targeted_refresh(j,node_id,k)"), 'stale/missing target records must use bounded targeted refresh');
  assert.ok(block.includes("classification='stale-record-target-refresh-recovered'"), 'record-freshness recovery must have an explicit class');
  assert.ok(block.includes("record_transition='became-valid-after-timeout'"), 'background lookup warming must remain observable');
  assert.ok(block.includes("'schema':'truyn.d200.healed-reconvergence.v2'"), 'artifact schema must identify the origin-aware classifier');

  assert.equal(block.includes('d1000-healed-fresh-session-retry'), false, 'ambiguous fresh-session label must be removed');
  assert.equal(block.includes("classification='fresh-session-recovered'"), false, 'ambiguous legacy classification must be removed');
  assert.equal(block.includes('systemctl restart'), false, 'diagnostic recovery must not restart node processes');
  assert.equal(block.includes('iptables '), false, 'healed-origin classifier must not mutate packet-level fault rules');

  const shell = spawnSync('bash', ['-n', target], { encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr || shell.stdout);
  const repeat = spawnSync('python3', ['scripts/patch-class-d-diagnostic-healed-origin.py', target], { encoding: 'utf8' });
  assert.notEqual(repeat.status, 0, 'healed origin patch must fail closed when applied twice');
});
