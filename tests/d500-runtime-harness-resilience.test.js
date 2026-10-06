import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const provision = await readFile('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');
const campaign = await readFile('benchmarks/scale/class-d-azure-1000-campaign.sh', 'utf8');
const runtime = await readFile('network/runtime.js', 'utf8');
const discovery = await readFile('network/discovery/peer-discovery.js', 'utf8');
const service = await readFile('network/testnet/node-service.js', 'utf8');
const workflow = await readFile('.github/workflows/d500-scale-run.yml', 'utf8');

test('D-500 host fanout is fail-collect with live heartbeat', () => {
  assert.match(provision, /wait_host_stage\(\)/);
  assert.match(provision, /TRUYN_D500_HEARTBEAT stage=/);
  assert.match(provision, /TRUYN_D500_HOST_SUMMARY stage=/);
  assert.match(provision, /host_status_arm\(\)[\s\S]*trap - ERR/);
  assert.match(provision, /TRUYN_D500_HEARTBEAT stage=%s host=%s state=%s elapsedSec=%s/);
  assert.match(provision, /wait_host_stage bootstrap /);
  assert.match(campaign, /wait_host_stage readiness /);
  assert.match(campaign, /wait_host_stage convergence /);
  assert.match(campaign, /wait_host_stage pre-baseline-peer-freshness /);
  assert.match(campaign, /wait_host_stage baseline /);
  assert.match(campaign, /wait_host_stage durable-writes /);
  assert.match(campaign, /wait_host_stage restart-recovery /);
  assert.match(campaign, /wait_host_stage post-restart-routing /);
  assert.match(campaign, /wait_host_stage healed-routing /);
  assert.match(campaign, /wait_host_stage resources /);
  assert.doesNotMatch(provision, /for pid in "\$\{bootstrap_pids\[@\]\}"; do wait "\$pid"; done/);
  assert.doesNotMatch(campaign, /for pid in "\$\{conv_pids\[@\]\}"; do wait "\$pid"; done/);
});

test('D-500 bootstrap uses bounded node parallelism and preserves per-node diagnostics', () => {
  assert.match(provision, /D500_NODE_WORKERS="\$\{TRUYN_D500_NODE_WORKERS:-5\}"/);
  assert.match(provision, /D500_NODE_WORKERS.*-le 8/);
  assert.match(provision, /TRUYN_D500_BOOTSTRAP_PROGRESS host=/);
  assert.match(provision, /TRUYN_D500_BOOTSTRAP_NODE_FAILURE host=/);
  assert.match(provision, /systemctl show "truyn-d1000@/);
  assert.match(provision, /journalctl -u "truyn-d1000@/);
  assert.match(provision, /targetConcurrency:4/);
  assert.match(provision, /timeoutMs:240000/);
  assert.match(provision, /--max-time 300/);
  assert.match(provision, /\.refreshed == true/);
});

test('PR #700 NEED recovery remains control-plane-only before one application send', () => {
  assert.match(runtime, /if \(!this\.discovery\.get\(nodeId\)\)/);
  assert.match(runtime, /this\.findPeer\(nodeId\)/);
  assert.match(runtime, /TRUYN_PEER_NOT_FOUND/);
  assert.match(runtime, /return this\.send\(nodeId, this\.envelope\('NEED'/);
});

test('PR #718 restart recovery fixes remain present', () => {
  assert.match(runtime, /backgroundBudget = Math\.max\(0, this\.discovery\.k - required\.size\)/);
  assert.match(runtime, /this\.discovery\.closest\(record\.nodeId, this\.discovery\.k\)/);
  assert.match(runtime, /this\.peerRecordRecoveryRetryTimer/);
  assert.match(runtime, /this\.discovery\.get\(peer\.nodeId\) \|\| peer/);
  assert.match(campaign, /sameRecord=true/);
  assert.match(service, /issuedAt: typeof body\.issuedAt/);
});

test('PR #722 bounded DHT refresh and single-flight semantics remain present', () => {
  assert.match(service, /dhtRefreshInFlight/);
  assert.match(service, /dhtRefreshInFlightKey/);
  assert.match(service, /TRUYN_DHT_REFRESH_IN_FLIGHT/);
  assert.match(service, /targetConcurrency/);
  assert.match(service, /timeoutMs/);
});

test('D-200 post-heal signed-hint recovery semantics remain present', () => {
  assert.match(discovery, /Non-authoritative routing contact: the stored signed record even if its lease expired/);
  assert.match(discovery, /verifyPeerRecord\(record, \{ allowExpired: true \}\)/);
  assert.match(discovery, /Asking a stale hint for the target itself returns the target's current signed self-record/);
  assert.match(discovery, /found: this\.get\(targetNodeId\)/);
});

test('D-500 keeps the proven D-200 staging compatibility path', () => {
  assert.match(workflow, /TRUYN_CLASS_D1000_LOCATION="\$TRUYN_D200_LOCATION"/);
  assert.match(workflow, /TRUYN_CLASS_D1000_VM_SIZE="\$TRUYN_D200_VM_SIZE"/);
  assert.match(workflow, /bash scripts\/d200-stage-runtime-bundle\.sh/);
  assert.match(workflow, /source scripts\/d200-stage-isolated-campaign\.sh/);
});

test('freshness barrier and batched diagnostics remain part of the real campaign', () => {
  assert.match(campaign, /STAGE=pre-baseline-peer-freshness/);
  assert.match(campaign, /D500_PREBASELINE_FRESHNESS_MARGIN_MS/);
  assert.match(campaign, /D500_BASELINE_DIAG_BATCH_ROWS=4/);
  assert.match(campaign, /gzip/);
  assert.match(campaign, /sha256/);
  assert.match(campaign, /base64/);
});

test('active D-500 workflow does not restore legacy admission/prelaunch gates', () => {
  assert.doesNotMatch(workflow, /verify-d-series-admission-run/);
  assert.doesNotMatch(workflow, /Verify frozen-candidate admission/);
  assert.doesNotMatch(workflow, /B01.*B16/);
});
