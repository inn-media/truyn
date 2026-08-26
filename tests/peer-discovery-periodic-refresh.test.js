import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createIdentity } from '../core/identity/index.js';
import { PeerDiscovery } from '../network/discovery/peer-discovery.js';

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

test('PeerDiscovery periodic refresh uses bounded fake timers and close clears the active timer', async () => {
  const discovery = new PeerDiscovery({ identity: createIdentity() });
  const timerApi = fakeTimerApi();
  const calls = [];
  discovery.refreshRoutingTable = async (options) => {
    calls.push(options);
    return {
      refreshed: true,
      targets: ['target-a', 'target-b'],
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
