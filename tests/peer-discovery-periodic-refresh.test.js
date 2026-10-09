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
    targetConcurrency: 3,
    timeoutMs: 900,
    jitterRatio: 0,
    seed: 'periodic-test',
    timerApi
  });

  assert.equal(initial.enabled, true);
  assert.equal(initial.scheduled, true);
  assert.deepEqual(initial.config, {
    intervalMs: 1_234,
    targetCount: 2,
    maxRounds: 3,
    targetConcurrency: 3,
    timeoutMs: 900,
    jitterRatio: 0,
    seed: 'periodic-test'
  });
  assert.equal(timerApi.timers.length, 1);
  assert.equal(timerApi.timers[0].delay, 1_234);
  assert.equal(timerApi.timers[0].unrefCalled, true);

  timerApi.timers[0].fn();
  await flushPromises();

  assert.deepEqual(calls, [{ targetCount: 2, maxRounds: 3, targetConcurrency: 3, timeoutMs: 900, seed: 'periodic-test:1', earlyExitIdleWalks: 4, nearExpiryHorizonMs: 120000 }]);
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

  discovery.startPeriodicRefresh({ intervalMs: 50, targetCount: 4, maxRounds: 2, targetConcurrency: 2, timeoutMs: 1_000, jitterRatio: 0, seed: 'no-overlap', timerApi });
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
  // Keep all 8 test contacts inside routing buckets before evaluating expiries.
  const discovery = new PeerDiscovery({ identity: local, k: 8 });
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

test('bounded signed peer cache never evicts routing contacts and refresh targets route contacts', () => {
  const local = createIdentity();
  const discovery = new PeerDiscovery({ identity: local, k: 2, maxCachedRecords: 3 });
  const now = Date.parse('2026-10-09T12:00:00Z');
  const remotes = Array.from({ length: 80 }, () => createIdentity());
  remotes.forEach((identity, index) => {
    const record = peerRecord({ identity, issuedAtMs: now, ttlMs: 60_000 + index * 1_000, port: 5800 + index });
    assert.equal(discovery.ingest(record, { now }).accepted, true);
  });
  const routing = new Set(discovery.routing.snapshot().map((peer) => peer.nodeId));
  assert.ok(routing.size > 0);
  for (const id of routing) assert.ok(discovery.records.has(id), 'never evict a current routing contact');
  assert.ok(discovery.records.size <= routing.size + 3 + 32);
  assert.ok(discovery.recordEvictions > 0);
  assert.deepEqual(new Set(discovery.routingRecords().map((record) => record.nodeId)), routing);
  const plan = discovery.refreshTargetPlan({ targetCount: 8, expiryTargetCount: 4, now, seed: 'bounded-routing' });
  assert.ok(plan.nearExpiryTargets.length > 0);
  for (const id of plan.nearExpiryTargets) assert.ok(routing.has(id));
});

test('renewed lease is not a novel transport binding; restart generation is novel', () => {
  const discovery = new PeerDiscovery({ identity: createIdentity() });
  const remote = createIdentity();
  const now = Date.now();
  const gen = (sequence, instanceId, millis) => createPeerRecord({
    identity: remote, endpoints: ['quic://10.0.0.7:4400'], sequence,
    instanceId, issuedAt: new Date(millis).toISOString(), ttlMs: 60_000
  });
  const original = gen(1, 'a', now);
  assert.equal(discovery.ingest(original).novel, true);
  assert.equal(discovery.ingest(original).novel, false);
  const renewed = discovery.ingest(gen(2, 'a', now + 1));
  assert.equal(renewed.updated, true);
  assert.equal(renewed.novel, false);
  assert.equal(discovery.ingest(gen(3, 'b', now + 2)).novel, true);
});

test('background DHT refresh yields on busy, fails closed, and does not create hedge amplification', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks');
  const lane = new AsyncLocalStorage();
  const local = createIdentity();
  const now = Date.now();
  const peers = Array.from({ length: 12 }, (_, i) => peerRecord({
    identity: createIdentity(), issuedAtMs: now, ttlMs: 600_000, port: 5900 + i
  }));
  let calls = 0;
  const rpc = {
    timeoutMs: 5_000,
    currentLane: () => lane.getStore() || 'control',
    withLane: (value, op) => lane.run(value, op),
    async findNode() {
      calls += 1;
      const error = new Error('TRUYN_BUSY');
      error.code = 'TRUYN_BUSY';
      throw error;
    }
  };
  const discovery = new PeerDiscovery({ identity: local, rpc, k: 20 });
  for (const record of peers) discovery.ingest(record, { now });
  const result = await rpc.withLane('background', () => discovery.refreshRoutingTable({
    targetCount: 8, maxRounds: 4, targetConcurrency: 1, seed: 'busy'
  }));
  assert.equal(result.reason, 'refresh_backpressure');
  assert.equal(result.refreshed, false, 'do not accept deferred refresh as PASS');
  assert.equal(result.walks.length, 1);
  assert.ok(calls <= 3, 'do not fan out once remote reports busy');
  calls = 0;
  const foreground = await discovery.refreshRoutingTable({
    targetCount: 1, maxRounds: 4, targetConcurrency: 1, seed: 'busy-fg'
  });
  assert.equal(foreground.walks.length, 1);
  assert.ok(calls > 3, 'foreground retains peer fallback');
});

test('PeerDiscovery walk does not globally forget a peer after one failed lookup stream', async () => {
  const local = createIdentity();
  const remoteIdentity = createIdentity();
  let forgetCalls = 0;
  const rpc = {
    async findNode() { throw new Error('transient_stream_failure'); },
    forget() { forgetCalls += 1; }
  };
  const discovery = new PeerDiscovery({ identity: local, rpc });
  const now = Date.now();
  discovery.ingest(peerRecord({ identity: remoteIdentity, issuedAtMs: now, ttlMs: 60_000, port: 5700 }), { now });

  const result = await discovery.walk(remoteIdentity.nodeId, { maxRounds: 1, stopOnFound: false });

  assert.equal(result.responses, 0);
  assert.equal(forgetCalls, 0, 'one failed find-node stream must not tear down the shared peer binding');
});

test('PeerDiscovery periodic refresh applies bounded deterministic jitter and an aggregate deadline', async () => {
  const identity = createIdentity();
  const discovery = new PeerDiscovery({ identity });
  const timerApi = fakeTimerApi();
  const calls = [];
  discovery.refreshRoutingTable = async (options) => {
    calls.push(options);
    return { refreshed: true, targets: [], targetSelection: { nearExpiryTargets: 0, xorTargets: 0 }, walks: [], queriedPeers: [], responses: 0, routingSizeDelta: 0, validPeersDelta: 0 };
  };

  discovery.startPeriodicRefresh({
    intervalMs: 10_000,
    targetCount: 8,
    maxRounds: 3,
    targetConcurrency: 2,
    timeoutMs: 7_500,
    jitterRatio: 0.2,
    seed: 'jitter-proof',
    timerApi
  });

  assert.equal(timerApi.timers.length, 1);
  assert.ok(timerApi.timers[0].delay >= 8_000 && timerApi.timers[0].delay <= 12_000);
  timerApi.timers[0].fn();
  await flushPromises();
  assert.deepEqual(calls, [{
    targetCount: 8,
    maxRounds: 3,
    targetConcurrency: 2,
    timeoutMs: 7_500,
    seed: 'jitter-proof:1',
    earlyExitIdleWalks: 4,
    nearExpiryHorizonMs: 120000
  }]);
  discovery.close();
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
  assert.match(runtime, /Math\.min\(30_000, Math\.max\(1, Math\.floor\(peerRecordTtlMs \/ 4\)\)\)/);
  assert.match(runtime, /periodicRefreshIntervalMs >= peerRecordTtlMs/);
  assert.match(runtime, /this\.discovery\.startPeriodicRefresh\(\{/);
  assert.match(runtime, /intervalMs: this\.discoveryRefreshIntervalMs/);
  assert.match(runtime, /targetCount: this\.discoveryRefreshTargetCount/);
  assert.match(runtime, /maxRounds: this\.discoveryRefreshMaxRounds/);
  assert.match(runtime, /targetConcurrency: this\.discoveryRefreshTargetConcurrency/);
  assert.match(runtime, /timeoutMs: this\.discoveryRefreshTimeoutMs/);
  assert.match(runtime, /jitterRatio: this\.discoveryRefreshJitterRatio/);
  assert.match(runtime, /this\.discovery\.close\(\)/);
});
