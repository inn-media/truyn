import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 healed evidence transport is bounded, chunked, digest-verified and distribution-independent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-healed-transport-'));
  const target = join(dir, 'campaign.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-campaign.sh', target);

  for (const patcher of [
    'scripts/patch-class-d-diagnostic-healed-reconvergence.py',
    'scripts/patch-class-d-diagnostic-healed-origin.py',
    'scripts/patch-class-d-diagnostic-healed-evidence-transport.py',
  ]) {
    const run = spawnSync('python3', [patcher, target], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.stdout);
  }

  const after = await readFile(target, 'utf8');
  const healedStart = after.indexOf('STAGE=healed-routing');
  const retentionStart = after.indexOf('STAGE=write-retention');
  assert.ok(healedStart >= 0 && retentionStart > healedStart, 'expected bounded healed-routing block');
  const block = after.slice(healedStart, retentionStart);

  assert.ok(block.includes('D200_HEALED_EVIDENCE_TRANSPORT=1'));
  assert.ok(block.includes('D200_HEALED_TRANSPORT_MAX_BYTES=1800'));
  assert.ok(block.includes('D200_HEALED_TRANSPORT_CHUNK_CHARS=512'));
  assert.ok(block.includes('D200_HEALED_FAILURE_SAMPLE_LIMIT=1'), 'detailed evidence must not grow with per-host failure distribution');
  assert.ok(block.includes('failures[:D200_HEALED_FAILURE_SAMPLE_LIMIT]'));
  assert.ok(block.includes("'failureSamplesOmitted':max(0,len(failures)-len(transport_failures))"));
  assert.ok(block.includes("'failureCount':sum(int(row.get('failureCount') or 0) for row in rows)"), 'top-level failureCount must aggregate full host failure counts, not sampled details');
  assert.equal(block.includes("'classificationCounts':counts,'failureCount':len(failures),'hosts':rows"), false, 'sampled failure detail count must not overwrite aggregate failureCount');
  assert.equal(block.includes('HEALED_DIAG_B64='), false, 'oversized single marker must not remain');
  assert.ok(block.includes('HEALED_DIAG_CHUNK_'));
  assert.ok(block.includes('HEALED_DIAG_META='));
  assert.ok(block.includes('payload_truncated=1 reason=producer_byte_cap'));
  assert.ok(block.includes('payload_truncated=1 reason=meta_missing'));
  assert.ok(block.includes('payload_truncated=1 reason=missing_chunk'));
  assert.ok(block.includes("fail('byte_count_mismatch')"));
  assert.ok(block.includes("fail('sha256_mismatch')"));
  assert.ok(block.includes("fail('base64_invalid')"));
  assert.ok(block.includes('hashlib.sha256(raw).hexdigest()'));

  assert.equal(block.includes("'result':value"), false, 'raw refreshRoutingTable response must not be retained');
  assert.ok(block.includes("'resultSummary':result_summary"), 'targeted refresh must retain only bounded summary fields');
  assert.ok(block.includes("'queriedPeerCount':len(queried)"), 'queried peer IDs must be represented by a count only');
  assert.equal(block.includes("'queriedPeerCount':len(item.get('queried') or [])"), false, 'per-walk queried peer arrays must not be transported');
  assert.ok(block.includes("'walksOmitted':len(walks)"), 'walk details must be omitted rather than copied into the transport payload');

  const representativeFailureSample = {
    sourceLocalNode: 9,
    targetHost: 19,
    targetLocalNode: 9,
    classification: 'valid-record-target-refresh-recovered',
    recordTransition: 'became-valid-during-first-attempt',
    firstAttempt: { ok: false, curlRc: 28, httpCode: '000', latencyMs: 15054.123 },
    stateBeforeRecovery: { validPeers: 189, routingSize: 200, staleRoutingPeers: 199, populatedBuckets: 11 },
    peerRecordBeforeFirstAttempt: { readOk: true, present: true, validNow: false, expired: true, expiresInMs: -999999 },
    peerRecordAfterFirstAttempt: { readOk: true, present: true, validNow: true, expired: false, expiresInMs: 1799999 },
    forcedTargetTransportReset: { ok: true, drainMs: 105001.234, partitionOk: true, rediscardBeforeHealOk: true, healOk: true },
    sessionResetRetry: { ok: false, curlRc: 28, httpCode: '000', latencyMs: 15000 },
    targetedRefresh: { ok: true, latencyMs: 45000, resultSummary: { refreshed: true, queriedPeerCount: 200, responseCount: 200, routingSizeDelta: 200, validPeersDelta: 200 } },
    peerRecordAfterTargetedRefresh: { readOk: true, present: true, validNow: true, expired: false, expiresInMs: 1799999 },
    postRefreshRetry: { ok: true, curlRc: 0, httpCode: '200', latencyMs: 9999.999 },
  };
  const representativeHostPayload = {
    host: 19,
    firstAttempt: { success: 0, total: 10, p50Ms: 15000, p90Ms: 15000, p95Ms: 15000, p99Ms: 15000 },
    failureCount: 10,
    classificationCounts: { 'valid-record-target-refresh-recovered': 10 },
    failureSampleCount: 1,
    failureSamplesOmitted: 9,
    failures: [representativeFailureSample],
  };
  assert.ok(Buffer.byteLength(JSON.stringify(representativeHostPayload)) < 1800, 'one worst-path causal sample plus aggregate counts must fit the transport cap even when all 10 probes fail on one host');

  assert.ok(block.includes("'schema':'truyn.d200.healed-reconvergence.v3'"));
  assert.ok(block.includes("'schema':'truyn.d200.healed-evidence-transport.v1'"));
  assert.ok(block.includes('class-d-200-healed-reconvergence-digest.txt'));
  assert.ok(block.includes("assert float('$healed_rate') >= .99, '$healed_rate'"), '99% first-attempt acceptance must remain unchanged');
  assert.ok(block.includes('success=sum(ok for ok,_,_ in rows)'), 'diagnostic retries must not affect healed acceptance accounting');

  const shell = spawnSync('bash', ['-n', target], { encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr || shell.stdout);

  const repeat = spawnSync('python3', ['scripts/patch-class-d-diagnostic-healed-evidence-transport.py', target], { encoding: 'utf8' });
  assert.notEqual(repeat.status, 0, 'bounded evidence transport patch must fail closed when applied twice');
});
