import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createIdentity } from '../core/identity/index.js';
import { createDhtRecord } from '../network/dht/kademlia.js';

test('fixed issuedAt makes a timed-out DHT write safe to retry as the same record id', () => {
  const identity = createIdentity();
  const options = {
    identity,
    namespace: 'class-d1000',
    key: 'd1000-0-3',
    value: { host: 0, index: 3 },
    sequence: 1,
    ttlMs: 21_600_000,
    issuedAt: '2026-09-22T07:00:00.000Z'
  };
  const first = createDhtRecord(options);
  const retry = createDhtRecord(options);
  assert.equal(retry.recordId, first.recordId);
  assert.equal(retry.issuedAt, first.issuedAt);
  assert.equal(retry.expiresAt, first.expiresAt);
});

test('D-500 durable-write retry is bounded to one client timeout and reuses issuedAt', async () => {
  const campaign = await readFile('benchmarks/scale/class-d-azure-1000-campaign.sh', 'utf8');
  const service = await readFile('network/testnet/node-service.js', 'utf8');
  const start = campaign.indexOf('STAGE=durable-writes');
  const end = campaign.indexOf('STAGE=restart-recovery', start);
  const durable = campaign.slice(start, end);
  assert.match(service, /issuedAt: typeof body\.issuedAt/);
  assert.match(durable, /--arg issuedAt/);
  assert.match(durable, /curl_rc_28/);
  assert.match(durable, /attempt=2/);
  assert.match(durable, /sameRecord=true/);
  assert.doesNotMatch(durable, /attempt=3/);
});
