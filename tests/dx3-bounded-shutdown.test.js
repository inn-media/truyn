import test from 'node:test';
import assert from 'node:assert/strict';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('stop detaches a non-cooperative adapter after a bounded drain and preserves dequeued work for restart', async () => {
  let releaseExecution;
  let observedSignal = null;
  const node = {
    async result() { throw new Error('late_result_should_be_suppressed'); },
    closeFastSocket() {}
  };
  const host = new TruynAdapterHost({
    node,
    executionDrainTimeoutMs: 20,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    adapter: createFunctionAdapter({
      name: 'non-cooperative',
      capabilities: ['review.shutdown'],
      execute: async ({ signal }) => {
        observedSignal = signal;
        return new Promise((resolve) => { releaseExecution = resolve; });
      }
    })
  });

  host.running = true;
  const handled = host.handleLifecycleEvent({
    kind: 'NEED',
    verification: { ok: true },
    envelope: { id: 'hung-need', from: 'requester', payload: { capability: { name: 'review.shutdown' }, input: {} } }
  });
  await delay(0);
  assert.equal(host.inFlight.size, 1);
  assert.ok(observedSignal);

  const startedAt = Date.now();
  await host.stop({ preserveDequeuedWork: true });
  const elapsedMs = Date.now() - startedAt;

  assert.ok(elapsedMs < 500, `bounded stop took ${elapsedMs}ms`);
  assert.equal(observedSignal.aborted, true);
  assert.equal(host.executionDrainTimedOut, true);
  assert.equal(host.inFlight.size, 0);
  assert.equal(host.pendingNeeds.length, 1);
  assert.equal(host.pendingNeeds[0].need.id, 'hung-need');

  releaseExecution({ output: 'late' });
  await Promise.allSettled([handled.promise]);
  assert.equal(host.pendingNeeds.length, 1);
  await host.stop();
  assert.equal(host.pendingNeeds.length, 0);
});
