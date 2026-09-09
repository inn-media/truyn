import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 refreshes live signed peer-record snapshots and requires all 20 bootstrap failure domains', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-peer-lease-'));
  const target = join(dir, 'provision.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-provision.sh', target);
  const before = await readFile(target, 'utf8');
  const ttlCountBefore = before.split('TRUYN_PEER_RECORD_TTL_MS=1800000').length - 1;

  let run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-bootstrap-parallel.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-peer-lease-freshness.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);

  const value = await readFile(target, 'utf8');
  const refreshStart = value.indexOf('STAGE=bootstrap-record-refresh');
  const bootstrapStart = value.indexOf('STAGE=bootstrap\n', refreshStart + 1);
  const bandwidthStart = value.indexOf('STAGE=bandwidth-meter', bootstrapStart);
  assert.ok(refreshStart >= 0 && bootstrapStart > refreshStart && bandwidthStart > bootstrapStart);
  const refreshBlock = value.slice(refreshStart, bootstrapStart);
  const bootstrapBlock = value.slice(bootstrapStart, bandwidthStart);

  assert.ok(refreshBlock.includes('D200_PEER_LEASE_FRESHNESS_REPAIR=1'));
  assert.ok(value.includes('BOOTSTRAP_MIN_PEER_LEASE_REMAINING_MS=900000'));
  assert.ok(refreshBlock.includes("http://127.0.0.1:{base+j}/record"), 'live control records must be regenerated immediately before bootstrap');
  assert.ok(refreshBlock.includes("issued_raw=record.get('issuedAt')"));
  assert.ok(refreshBlock.includes("expires_raw=record.get('expiresAt')"));
  assert.ok(refreshBlock.includes('expires <= issued'));
  assert.ok(refreshBlock.includes('minimum_remaining < minimum_remaining_ms'));
  assert.ok(refreshBlock.includes("os.replace(temporary, final)"), 'records.json replacement must be atomic');
  assert.ok(refreshBlock.includes('bootstrap_record_refresh_pids=()'));
  assert.ok(refreshBlock.includes('(remote "${VMS[$i]}" "$script" >"$bootstrap_record_refresh_dir/$i") &'));
  assert.ok(refreshBlock.includes('for pid in "${bootstrap_record_refresh_pids[@]}"'));
  assert.ok(refreshBlock.includes('[[ "$bootstrap_record_refresh_hosts" == "$HOST_COUNT" ]]'));
  assert.ok(refreshBlock.includes('BOOTSTRAP_RECORD_REFRESH_MIN_REMAINING_MS'));
  assert.equal(refreshBlock.includes('/need'), false);

  assert.ok(bootstrapBlock.includes('TRUYN_BOOTSTRAP_REQUIRED_FAILURE_DOMAINS=${HOST_COUNT}'));
  assert.ok(bootstrapBlock.includes('requiredFailureDomains'));
  assert.ok(bootstrapBlock.includes('summary.minFailureDomains !== requiredFailureDomains'));
  assert.ok(bootstrapBlock.includes('BOOTSTRAP_PLAN_MIN_FAILURE_DOMAINS'));
  assert.ok(bootstrapBlock.includes('BOOTSTRAP_PLAN_MAX_FAILURE_DOMAINS'));
  assert.ok(bootstrapBlock.includes('[[ "$(marker "$out" BOOTSTRAP_PLAN_MIN_FAILURE_DOMAINS)" == "$HOST_COUNT" ]]'));
  assert.ok(bootstrapBlock.includes('[[ "$(marker "$out" BOOTSTRAP_PLAN_MAX_FAILURE_DOMAINS)" == "$HOST_COUNT" ]]'));
  assert.ok(bootstrapBlock.includes('plan=host-stratified-xor'));
  assert.ok(bootstrapBlock.includes('BOOTSTRAP_PLAN_ALL_TO_ALL'));
  assert.equal(bootstrapBlock.includes('/need'), false);

  assert.ok(value.includes('BOOTSTRAP_MAX_PEERS_PER_NODE=32'));
  assert.equal(value.split('TRUYN_PEER_RECORD_TTL_MS=1800000').length - 1, ttlCountBefore, '30-minute signed peer lease must remain unchanged');
  assert.equal(value.includes('TRUYN_PEER_RECORD_TTL_MS=14400000'), false, 'D-200 repair must not hide freshness failures by extending TTL');

  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-peer-lease-freshness.py', target], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'peer lease freshness patch must fail closed when applied twice');
});
