import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function apply(script, target) {
  return spawnSync('python3', [script, target], { encoding: 'utf8' });
}

test('D-200 baseline-origin evidence preserves first-attempt acceptance and bounds diagnostic retry transport', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-baseline-origin-'));
  const target = join(dir, 'campaign.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-campaign.sh', target);

  const parallel = apply('scripts/patch-class-d-diagnostic-baseline-parallel.py', target);
  assert.equal(parallel.status, 0, parallel.stderr || parallel.stdout);

  const run = apply('scripts/patch-class-d-diagnostic-baseline-origin.py', target);
  assert.equal(run.status, 0, run.stderr || run.stdout);

  const text = await readFile(target, 'utf8');
  const start = text.indexOf('STAGE=baseline-routing\n');
  const end = text.indexOf('STAGE=invalid-signed-state\n');
  assert.ok(start >= 0 && end > start);
  const block = text.slice(start, end);

  assert.ok(block.includes('D200_BASELINE_ORIGIN_DIAG=1'));
  assert.ok(block.includes('D200_BASELINE_ROW_MAX_BYTES=1800'));
  assert.ok(block.includes("records=json.load(open('/var/lib/truyn-d1000/records-by-host.json'))"), 'baseline diagnostics must consume the records file provisioned on every VM');
  assert.ok(block.includes("path=f'/var/lib/truyn-d1000/node-{global_index}-state.json'"), 'first-attempt peer state must use the canonical node-state directory');
  assert.ok(block.includes("state_path=f'/var/lib/truyn-d1000/node-{global_index}-state.json'"), 'diagnostic retry peer state must use the canonical node-state directory');
  assert.equal(block.includes('/var/lib/truyqn-d1000/'), false, 'misspelled diagnostic state path must never reappear');
  assert.ok(block.includes("peer_before=persisted_peer_state(j,node_id)"));
  assert.ok(block.includes("'routingBeforeFirstAttempt':state_before"));
  assert.ok(block.includes("'--max-time','15'"), 'canonical first attempt timeout must remain 15 seconds');
  assert.ok(block.includes("rows=list(ex.map(first_attempt,range(N*2)))"));
  assert.ok(block.includes("success=sum(ok for ok,_,_ in rows)"), 'acceptance success must be derived only from first attempts');
  assert.ok(block.includes('Phase 1: all hosts finish canonical first-attempt probes before any'), 'all hosts must finish first attempts before diagnostics');
  assert.ok(block.includes('Phase 2: only after the global first-attempt barrier'), 'diagnostic retries must be globally phase-separated from acceptance traffic');
  assert.ok(block.includes("'d1000-baseline-production-recovery-retry'"), 'failed first attempts must get one separate production-path diagnostic retry');
  assert.ok(block.includes("'countedInBaselineAcceptance':False"), 'diagnostic retry must never enter acceptance accounting');
  assert.ok(block.includes("'validPeers':r.get('validPeers')"));
  assert.ok(block.includes("'routingSize':r.get('routingSize')"));
  assert.ok(block.includes("'staleRoutingPeers':r.get('staleRoutingPeers')"));
  assert.ok(block.includes("'peerRecordBeforeFirstAttempt':peer_before"));
  assert.ok(block.includes("'boundedProductionDiscoveryRecovery'"));
  assert.ok(block.includes("diag_path=f'/var/lib/truyn-d1000/baseline-origin-host-{host}.json'"), 'full host evidence must be persisted off stdout');
  assert.ok(block.includes('BASE_DIAG_B64='), 'one bounded failure row may be transferred per remote call');
  assert.ok(block.includes('TRUYN_D200_BASELINE_PAYLOAD_TRUNCATED'), 'byte/digest/count mismatches must fail closed');
  assert.ok(block.includes('class-d-200-baseline-origin.json'));
  assert.ok(block.includes('class-d-200-baseline-origin-digest.txt'));
  assert.ok(block.includes("'schema':'truyn.d200.baseline-origin.v1'"));
  assert.ok(block.includes("assert float('$base_rate') >= .99, '$base_rate'"), 'baseline acceptance must remain >=99%');
  assert.equal(block.includes('/dht/refresh'), false, 'baseline origin diagnostic must exercise the production NEED discovery path, not explicit refresh');

  const shell = spawnSync('bash', ['-n', target], { encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr || shell.stdout);

  const second = apply('scripts/patch-class-d-diagnostic-baseline-origin.py', target);
  assert.notEqual(second.status, 0, 'patch must fail closed when applied twice');
});

test('D-200 baseline-origin patch also composes directly on canonical campaign', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-baseline-origin-canonical-'));
  const target = join(dir, 'campaign.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-campaign.sh', target);

  const run = apply('scripts/patch-class-d-diagnostic-baseline-origin.py', target);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const text = await readFile(target, 'utf8');
  assert.ok(text.includes('D200_BASELINE_ORIGIN_DIAG=1'));
  assert.ok(text.includes("records=json.load(open('/var/lib/truyn-d1000/records-by-host.json'))"));
  assert.equal(text.includes('/var/lib/truyqn-d1000/'), false);
  assert.ok(text.includes("assert float('$base_rate') >= .99, '$base_rate'"));
});
