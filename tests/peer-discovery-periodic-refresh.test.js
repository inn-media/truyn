import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createIdentity } from '../core/identity/index.js';
import { createPeerRecord, PeerDiscovery } from '../network/discovery/peer-discovery.js';

function fakeTimerApi() {
  const timers = [];
  return {
    timers,
    setTimeout(fn, delay) {
      const timer = {
        fn,
        delay,
        cleared: false,
        unrefCalled: false,
        unref() { this.unrefCalled = true; }
      };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      timer.cleared = true;
    }
  };
}

async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
}

function peerRecord({ identity, issuedAtMs, ttlMs, port }) {
  return createPeerRecord({
    identity,
    endpoints: [`quic://127.0.0.1:${port}`],
    issuedAt: new Date(issuedAtMs).toISOString(),
    ttlMs
  });
}

test('PeerDiscovery periodic refresh uses bounded fake timers and close clears the active timer', async () => {
  const discovery = new PeerDiscovery({ identity: createIdentity() });
  const timerApi = fakeTimerApi();
  const calls = [];
  discovery.refreshRoutingTable = async (options) => {
    calls.push(options);
    return {
      refreshed: true,
      targets: ['target-a', 'target-b'],
      targetSelection: { nearExpiryTargets: 1, xorTargets: 1 },
      walks: [{ queried: ['peer-a'], responses: 1 }],
      queriedPeers: ['peer-a'],
      responses: 1,
      routingSizeDelta: 1,
      validPeersDelta: 1
    };
  };

  const initial = discovery.startPeriodicRefresh({
    intervalMs: 1_234,
    targetCount: 2,
    maxRounds: 3,
    seed: 'periodic-test',
    timerApi
  });

  assert.equal(initial.enabled, true);
  assert.equal(initial.scheduled, true);
  assert.deepEqual(initial.config, {
    intervalMs: 1_234,
    targetCount: 2,
    maxRounds: 3,
    seed: 'periodic-test'
  });
  assert.equal(timerApi.timers.length, 1);
  assert.equal(timerApi.timers[0].delay, 1_234);
  assert.equal(timerApi.timers[0].unrefCalled, true);

  timerApi.timers[0].fn();
  await flushPromises();

  assert.deepEqual(calls, [{ targetCount: 2, maxRounds: 3, seed: 'periodic-test:1' }]);
  const afterRun = discovery.periodicRefreshSnapshot();
  assert.equal(afterRun.runs, 1);
  assert.equal(afterRun.failures, 0);
  assert.equal(afterRun.scheduled, true);
  assert.equal(afterRun.lastResult.refreshed, true);
  assert.equal(afterRun.lastResult.targets, 2);
  assert.equal(afterRun.lastResult.nearExpiryTargets, 1);
  assert.equal(afterRun.lastResult.xorTargets, 1);
  assert.equal(afterRun.lastResult.queriedPeers, 1);
  assert.equal(timerApi.timers.length, 2);
  assert.equal(timerApi.timers[1].delay, 1_234);

  const closed = discovery.close();
  assert.equal(closed, undefined);
  assert.equal(timerApi.timers[1].cleared, true);
  const afterClose = discovery.periodicRefreshSnapshot();
  assert.equal(afterClose.enabled, false);
  assert.equal(afterClose.scheduled, false);
});

test('PeerDiscovery periodic refresh does not overlap an in-flight refresh', async () => {
  const discovery = new PeerDiscovery({ identity: createIdentity() });
  const timerApi = fakeTimerApi();
  let resolveRefresh;
  const calls = [];
  discovery.refreshRoutingTable = async (options) => {
    calls.push(options);
    return await new Promise((resolve) => { resolveRefresh = resolve; });
  };

  discovery.startPeriodicRefresh({ intervalMs: 50, targetCount: 4, maxRounds: 2, seed: 'no-overlap', timerApi });
  timerApi.timers[0].fn();
  await flushPromises();

  assert.equal(calls.length, 1);
  assert.equal(discovery.periodicRefreshSnapshot().inFlight, true);
  assert.equal(timerApi.timers.length, 1, 'next timer must not be scheduled before the in-flight refresh settles');

  resolveRefresh({ refreshed: true, targets: [], walks: [], queriedPeers: [], responses: 0, routingSizeDelta: 0, validPeersDelta: 0 });
  await flushPromises();

  assert.equal(discovery.periodicRefreshSnapshot().inFlight, false);
  assert.equal(discovery.periodicRefreshSnapshot().runs, 1);
  assert.equal(timerApi.timers.length, 2);
  discovery.close();
});

test('PeerDiscovery reserves bounded refresh budget for records nearest to expiry', () => {
  const local = createIdentity();
  const discovery = new PeerDiscovery({ identity: local, k: 4 });
  const now = Date.parse('2026-09-08T18:00:00.000Z');
  const remotes = Array.from({ length: 8 }, () => createIdentity());
  const expiries = [90_000, 10_000, 50_000, 20_000, 70_000, 30_000, 80_000, 40_000];

  remotes.forEach((identity, index) => {
    const ttlMs = expiries[index];
    const record = peerRecord({ identity, issuedAtMs: now, ttlMs, port: 5500 + index });
    assert.equal(discovery.ingest(record, { now }).accepted, true);
  });

  const plan = discovery.refreshTargetPlan({
    targetCount: 4,
    expiryTargetCount: 2,
    now,
    seed: 'expiry-lane-test'
  });

  assert.equal(plan.targets.length, 4);
  assert.equal(new Set(plan.targets).size, 4);
  assert.deepEqual(plan.nearExpiryTargets, [remotes[1].nodeId, remotes[3].nodeId]);
  assert.equal(plan.xorTargets.length, 2);
  assert.deepEqual(plan.targets.slice(0, 2), plan.nearExpiryTargets);
});

test('PeerDiscovery lease snapshot exposes the exact TTL rollover without changing lease validity semantics', () => {
  const local = createIdentity();
  const remote = createIdentity();
  const discovery = new PeerDiscovery({ identity: local });
  const issuedAtMs = Date.parse('2026-09-08T18:00:00.000Z');
  const ttlMs = 30 * 60 * 1000;
  const record = peerRecord({ identity: remote, issuedAtMs, ttlMs, port: 5600 });
  assert.equal(discovery.ingest(record, { now: issuedAtMs }).accepted, true);

  const before = discovery.leaseSnapshot({ now: issuedAtMs + ttlMs - 1_000 });
  assert.equal(before.recordCount, 1);
  assert.equal(before.validPeerRecords, 1);
  assert.equal(before.expiredPeerRecords, 0);
  assert.equal(before.oldestPeerRecordIssuedAt, new Date(issuedAtMs).toISOString());
  assert.equal(before.nearestPeerRecordExpiryMs, 1_000);

  const after = discovery.leaseSnapshot({ now: issuedAtMs + ttlMs + 1 });
  assert.equal(after.recordCount, 1);
  assert.equal(after.validPeerRecords, 0);
  assert.equal(after.expiredPeerRecords, 1);
  assert.equal(after.nearestPeerRecordExpiryMs, -1);
  assert.equal(discovery.snapshot({ now: issuedAtMs + ttlMs + 1 }).length, 0, 'expired lease must remain fail-closed');
});

test('runtime starts bounded periodic discovery refresh below peer-record lifetime and closes it', async () => {
  const runtime = await readFile(new URL('../network/runtime.js', import.meta.url), 'utf8');

  assert.match(runtime, /discoveryPeriodicRefresh = true/);
  assert.match(runtime, /discoveryRefreshIntervalMs = null/);
  assert.match(runtime, /Math\.min\(60_000, Math\.max\(1, Math\.floor\(peerRecordTtlMs \/ 2\)\)\)/);
  assert.match(runtime, /periodicRefreshIntervalMs >= peerRecordTtlMs/);
  assert.match(runtime, /this\.discovery\.startPeriodicRefresh\(\{/);
  assert.match(runtime, /intervalMs: this\.discoveryRefreshIntervalMs/);
  assert.match(runtime, /targetCount: this\.discoveryRefreshTargetCount/);
  assert.match(runtime, /maxRounds: this\.discoveryRefreshMaxRounds/);
  assert.match(runtime, /this\.discovery\.close\(\)/);
});
