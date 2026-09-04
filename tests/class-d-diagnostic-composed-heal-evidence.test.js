import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 composed heal diagnostics apply bounded local controls and preserve strict gates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-composed-heal-'));
  const provisionTarget = join(dir, 'provision.sh');
  const campaignTarget = join(dir, 'campaign.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-provision.sh', provisionTarget);
  await copyFile('benchmarks/scale/class-d-azure-1000-campaign.sh', campaignTarget);
  const provisionBefore = await readFile(provisionTarget, 'utf8');
  const campaignBefore = await readFile(campaignTarget, 'utf8');

  const run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-composed-heal-evidence.py', provisionTarget, campaignTarget], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /TRUYN_D200_COMPOSED_PATCH=PASS order=local-fault-control,failure-evidence,packet-partition,healed-reconvergence,healed-origin,bounded-evidence-transport,write-retention-window/);

  const provisionAfter = await readFile(provisionTarget, 'utf8');
  const campaignAfter = await readFile(campaignTarget, 'utf8');
  assert.equal(provisionBefore.includes('TRUYN_TESTNET_FAULT_CONTROL=1'), false, 'canonical provision fixture must not enable diagnostic fault control');
  assert.equal(provisionAfter.match(/TRUYN_TESTNET_FAULT_CONTROL=1/g)?.length, 1, 'diagnostic fault control must be enabled exactly once');
  assert.ok(provisionAfter.includes('TRUYN_CONTROL_HOST=127.0.0.1'), 'diagnostic fault control must remain on the localhost control plane');
  assert.equal(provisionAfter.match(/d200_failure_evidence_checkpoint\(\) \{/g)?.length, 1, 'universal failure helper must be installed exactly once on provisioner');
  assert.equal(provisionAfter.match(/d200_err_trap\(\) \{/g)?.length, 1, 'universal ERR helper must be installed exactly once on provisioner');
  assert.ok(campaignAfter.includes('PACKET_DIAG_PHASE=heal-timeout'), 'packet heal diagnostics must remain installed');
  assert.ok(campaignAfter.includes('TRUYN_D200_FAILURE_EVIDENCE=CHECKPOINT stage=packet-partition'), 'packet-specific checkpoint marker must coexist with universal provisioner checkpoint');
  assert.ok(campaignAfter.includes('D200_HEALED_EVIDENCE_TRANSPORT=1'), 'bounded healed evidence transport must be installed');
  assert.ok(campaignAfter.includes('D200_HEALED_TRANSPORT_MAX_BYTES=1800'), 'host diagnostic payload must have a hard byte cap');
  assert.ok(campaignAfter.includes('HEALED_DIAG_CHUNK_'), 'healed diagnostics must be chunked instead of emitted as one oversized marker');
  assert.ok(campaignAfter.includes('HEALED_DIAG_META='), 'healed diagnostic transport must carry byte/digest/chunk metadata');
  assert.ok(campaignAfter.includes('TRUYN_D200_HEALED_PAYLOAD_TRUNCATED'), 'transport truncation must fail closed with an explicit marker');
  assert.equal(campaignAfter.includes('HEALED_DIAG_B64='), false, 'single oversized base64 marker must be removed');
  assert.equal(campaignAfter.includes("'result':value"), false, 'full targeted refresh response must not enter transported evidence');
  assert.ok(campaignAfter.includes("'queriedPeerCount':len(queried)"), 'queried peer IDs must be reduced to bounded counts');
  assert.ok(campaignAfter.includes('class-d-200-healed-reconvergence.json'), 'healed classifier artifact must be retained');
  assert.ok(campaignAfter.includes('class-d-200-healed-reconvergence-digest.txt'), 'persisted healed evidence must have a SHA-256 digest sidecar');
  assert.ok(campaignAfter.includes('persisted_peer_state(j,node_id)'), 'peer-record origin diagnostics must be installed');
  assert.ok(campaignAfter.includes("control+'/faults/partition'"), 'bounded cached-target transport reset must be installed');
  assert.ok(campaignAfter.includes("'schema':'truyn.d200.healed-reconvergence.v3'"), 'bounded evidence artifact schema must be explicit');
  assert.ok(campaignAfter.includes("'schema':'truyn.d200.healed-evidence-transport.v1'"), 'transport schema must be explicit');
  assert.equal(campaignAfter.includes("'schema':'truyn.d200.healed-reconvergence.v2'"), false, 'unbounded v2 artifact schema must not remain');
  assert.equal(campaignAfter.includes('d1000-healed-fresh-session-retry'), false, 'ambiguous legacy fresh-session retry must be removed');

  assert.equal(campaignBefore.includes('d200_durable_write_ttl_ms=21600000'), false, 'canonical campaign must remain unchanged before diagnostic composition');
  assert.equal((campaignBefore.match(/ttlMs:1800000/g) ?? []).length, 1, 'canonical fixture must contain exactly one 30-minute durable-write TTL');
  assert.ok(campaignAfter.includes('d200_durable_write_ttl_ms=21600000'), 'diagnostic durable writes must outlive the bounded campaign');
  assert.ok(campaignAfter.includes('d200_retention_required_margin_ms=900000'), 'retention verifier must reserve a 15-minute TTL margin');
  assert.ok(campaignAfter.includes('TRUYN_D200_WRITE_RETENTION_WINDOW_INVALID phase=before-check'), 'retention must fail closed before an invalid TTL window');
  assert.ok(campaignAfter.includes('TRUYN_D200_WRITE_RETENTION_WINDOW_INVALID phase=after-check'), 'retention must fail closed if the verifier itself crosses TTL');
  assert.ok(campaignAfter.includes('ttlMs:${d200_durable_write_ttl_ms}'), 'diagnostic durable writes must use the extended TTL variable');
  assert.equal(campaignAfter.includes('ttlMs:1800000'), false, 'expired 30-minute durable-write TTL must be removed from the diagnostic copy');
  assert.ok(campaignAfter.includes('[[ "$ack_loss" == 0 ]]'), 'acknowledged write loss acceptance must remain zero');

  assert.ok(campaignAfter.includes("assert float('$healed_rate') >= .99, '$healed_rate'"), 'first-attempt healed acceptance must remain >=99%');
  assert.ok(campaignAfter.includes('[[ "$partition_recovery_ms" -le 120000 ]]'), 'packet recovery must remain <=120s');

  for (const invariant of [
    ': "${HOST_COUNT:?source class-d-azure-1000-provision.sh first}"',
    ': "${NODES_PER_HOST:?source class-d-azure-1000-provision.sh first}"',
    ': "${NODE_COUNT:?source class-d-azure-1000-provision.sh first}"',
  ]) {
    assert.equal(campaignBefore.includes(invariant), true, `campaign fixture must contain invariant before composition: ${invariant}`);
    assert.equal(campaignAfter.includes(invariant), true, `composition must preserve campaign invariant: ${invariant}`);
  }

  for (const invariant of [
    'HOST_COUNT=20',
    'STRICT_NODES_PER_HOST=50',
    'DIAGNOSTIC_NODES_PER_HOST_SIZES="10 25 50"',
    'NODE_COUNT=$((HOST_COUNT * NODES_PER_HOST))',
  ]) {
    assert.equal(provisionBefore.includes(invariant), true, `provision fixture must contain invariant before composition: ${invariant}`);
    assert.equal(provisionAfter.includes(invariant), true, `composition must preserve sizing invariant: ${invariant}`);
  }

  const provisionShell = spawnSync('bash', ['-n', provisionTarget], { encoding: 'utf8' });
  assert.equal(provisionShell.status, 0, provisionShell.stderr || provisionShell.stdout);
  const campaignShell = spawnSync('bash', ['-n', campaignTarget], { encoding: 'utf8' });
  assert.equal(campaignShell.status, 0, campaignShell.stderr || campaignShell.stdout);

  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-composed-heal-evidence.py', provisionTarget, campaignTarget], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'composed patch must fail closed when applied twice');
});
