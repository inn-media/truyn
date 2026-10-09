import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const provision = await readFile('benchmarks/scale/class-d-azure-5000-provision.sh', 'utf8');
const campaign = await readFile('benchmarks/scale/class-d-azure-5000-campaign.sh', 'utf8');

test('Attempt 4 preserves D-5000 identity, physical scale and original paid load', () => {
  assert.match(provision, /^HOST_COUNT=20$/m);
  assert.match(provision, /^STRICT_NODES_PER_HOST=250$/m);
  assert.match(provision, /^D5000_MIN_VCPUS_PER_HOST=32$/m);
  assert.match(provision, /^BOOTSTRAP_MAX_PEERS_PER_NODE=32$/m);
  assert.match(provision, /^D5000_BOOTSTRAP_REFRESH_TARGET_COUNT=32$/m);
  assert.match(provision, /^D5000_BOOTSTRAP_REFRESH_TARGET_CONCURRENCY=4$/m);
  assert.match(provision, /maxRounds:4/);
  assert.match(provision, /timeoutMs:240000/);
  assert.match(provision, /localNodeIds: localRecords\.map/);
  assert.match(provision, /BOOTSTRAP_REFRESH_MIN_HOSTS/);
  assert.match(campaign, /stage=baseline/);
  assert.match(campaign, /stage=healed/);
});

test('Attempt 4 guest stdout is mirrored to host-local durable evidence', () => {
  assert.match(provision, /exec > >\(tee -a \/var\/lib\/truyn-d1000\/d5000-attempt4-bootstrap\.log\) 2>&1/);
  assert.match(provision, /TRUYN_D5000_A4_BOOTSTRAP_BEGIN/);
  assert.match(provision, /TRUYN_D5000_A4_PLAN_MS/);
  assert.match(provision, /TRUYN_D5000_A4_NODE_AGGREGATE/);
  assert.match(provision, /meanNodeMs/);
  assert.match(provision, /meanRefreshMs/);
  assert.match(provision, /totalResponses/);
  assert.match(provision, /retryNodes/);
  assert.match(provision, /\.phase/);
  assert.match(provision, /\.metrics/);
});

test('Attempt 4 snapshots timeouts independently, bounded and without influencing admission', () => {
  const snapshot = provision.indexOf('TRUYN_D5000_A4_SNAPSHOT_TRANSCRIPT_START');
  const assertion = provision.indexOf('[[ "$bootstrap_failed" == 0 ]]', snapshot);
  assert.ok(snapshot > 0 && assertion > snapshot, 'failure evidence must precede fail-closed bootstrap gate');
  assert.match(provision, /remote "\$\{VMS\[\$i\]\}" "\$snapshot_script" 150/);
  assert.match(provision, /TRUYN_D5000_A4_SNAPSHOT_TRANSPORT_RC=/);
  assert.match(provision, /TRUYN_D5000_A4_SNAPSHOT_END/);
  assert.match(provision, /TRUYN_D5000_A4_SAMPLE=/);
  assert.match(provision, /rpcQueuedTotal/);
  assert.match(provision, /rpcQueued/);
  assert.match(provision, /rpcShed/);
  assert.match(provision, /for j in 0 25 50 100 150 200 249/);
  assert.match(provision, /d5000-a4-telemetry/);
  assert.match(provision, /\[\[ "\$bootstrap_failed" == 0 \]\]/);
  assert.match(provision, /TRUYN_D5000_REMOTE=RED reason=azure_transport_failure/);
});

test('Attempt 4 cannot pass without full strict evidence and cleanup', async () => {
  const evaluator = await readFile('benchmarks/scale/evaluate-class-d-5000-evidence.js', 'utf8');
  const terminal = await readFile('benchmarks/scale/verify-class-d-5000-terminal.js', 'utf8');
  assert.match(evaluator, /readiness/);
  assert.match(evaluator, /baseline/);
  assert.match(evaluator, /healed/);
  assert.match(terminal, /cleanup/);
  assert.match(terminal, /testedCommit/);
});
