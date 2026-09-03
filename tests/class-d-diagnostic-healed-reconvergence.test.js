import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 healed reconvergence diagnostics classify first-attempt failures without weakening the 99% gate', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-healed-reconvergence-'));
  const target = join(dir, 'campaign.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-campaign.sh', target);
  const before = await readFile(target, 'utf8');
  const beforeHealed = before.indexOf('STAGE=healed-routing');
  const beforeRetention = before.indexOf('STAGE=write-retention');
  assert.ok(beforeHealed >= 0 && beforeRetention > beforeHealed, 'expected bounded healed-routing block');
  const prefixBefore = before.slice(0, beforeHealed);
  const suffixBefore = before.slice(beforeRetention);

  const run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-healed-reconvergence.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);

  const after = await readFile(target, 'utf8');
  const healedStart = after.indexOf('STAGE=healed-routing');
  const retentionStart = after.indexOf('STAGE=write-retention');
  assert.equal(after.slice(0, healedStart), prefixBefore, 'stages before healed routing must remain byte-identical');
  assert.equal(after.slice(retentionStart), suffixBefore, 'stages after healed routing must remain byte-identical');
  const block = after.slice(healedStart, retentionStart);

  assert.ok(block.includes('random.Random(20260820+host*10000+k)'), 'canonical deterministic target seed must remain');
  assert.ok(block.includes('target_host=r.randrange(H-1)'), 'canonical cross-host target selection must remain');
  assert.ok(block.includes('target_local=r.randrange(N)'), 'canonical target-local selection must remain');
  assert.ok(block.includes("first=need(j,node_id,'d1000-healed',k,'first')"), 'canonical first attempt must remain the acceptance probe');
  assert.ok(block.includes("'--max-time','15'"), 'first attempt must retain the 15-second request timeout');
  assert.ok(block.includes('success=sum(ok for ok,_,_ in rows)'), 'acceptance success must count only first attempts');
  assert.ok(block.includes("assert float('$healed_rate') >= .99, '$healed_rate'"), 'strict healed routing threshold must remain 99%');

  const firstGate = block.indexOf("if first['ok']:");
  const freshRetry = block.indexOf("fresh=need(j,node_id,'d1000-healed-fresh-session-retry'");
  const targetedRefresh = block.indexOf('refresh=targeted_refresh(j,node_id,k)');
  const postRefresh = block.indexOf("post_refresh=need(j,node_id,'d1000-healed-target-refresh-retry'");
  const strictGate = block.indexOf("assert float('$healed_rate') >= .99");
  const artifact = block.indexOf("'schema':'truyn.d200.healed-reconvergence.v1'");
  assert.ok(firstGate >= 0 && freshRetry > firstGate && targetedRefresh > freshRetry && postRefresh > targetedRefresh,
    'diagnostic recovery must run only after a first-attempt failure and in cache-then-refresh order');
  assert.ok(artifact > postRefresh && strictGate > artifact, 'diagnostic artifact must be durable before the unchanged fail-closed gate');

  assert.ok(block.includes("'targets':[node_id],'targetCount':1,'maxRounds':8"), 'failed targets must receive bounded targeted refresh only');
  assert.ok(block.includes("'staleRoutingPeers':r.get('staleRoutingPeers')"), 'diagnostics must capture stale routing peers');
  assert.ok(block.includes("'validPeers':r.get('validPeers')"), 'diagnostics must capture valid peer count');
  assert.ok(block.includes("classification='fresh-session-recovered'"), 'fresh-session recovery must be distinguishable');
  assert.ok(block.includes("classification='target-refresh-recovered'"), 'target-refresh recovery must be distinguishable');
  assert.ok(block.includes("'persistent-after-refresh'"), 'persistent failures must remain visible');
  assert.ok(block.includes("'acceptanceUsesFirstAttemptOnly':True"), 'artifact must state retries do not alter acceptance');
  assert.equal(block.includes('systemctl restart'), false, 'diagnostics must not restart processes');
  assert.equal(block.includes('iptables '), false, 'healed-routing diagnostics must not alter packet fault rules');

  const shell = spawnSync('bash', ['-n', target], { encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr || shell.stdout);
  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-healed-reconvergence.py', target], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'healed reconvergence patch must fail closed when applied twice');
});
