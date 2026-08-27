import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';

const runtimeServiceSource = readFileSync(new URL('../runtime/service.js', import.meta.url), 'utf8');

test('production provider runtime enters the lifecycle-aware adapter host loop', () => {
  assert.match(runtimeServiceSource, /await adapterHost\.start\(\)/);
  assert.doesNotMatch(runtimeServiceSource, /await adapterHost\.runOnce\(\)/);
});

test('verified REVOKE received before fast NEED creates a tombstone and suppresses later execution', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  await provider.offer('cancel.before.schedule');

  let executeCalls = 0;
  const host = new TruynAdapterHost({
    node: provider,
    fastPath: true,
    socketPath: false,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    adapter: createFunctionAdapter({
      name: 'ordering-host',
      capabilities: ['cancel.before.schedule'],
      execute: async () => {
        executeCalls += 1;
        return { output: 'must-not-run' };
      }
    })
  });

  const matched = await requester.compactNeed('cancel.before.schedule', { value: 1 }, {}, { waitMs: 0 });
  await requester.revoke(matched.needId, 'cancel_before_schedule');

  const control = await provider.poll();
  assert.equal(control.events.length, 1);
  assert.equal(control.events[0].kind, 'REVOKE');
  assert.equal(control.events[0].verification.ok, true);
  const cancellation = host.handleLifecycleEvent(control.events[0]);
  assert.deepEqual(cancellation, { cancelled: false, targetId: matched.needId });
  assert.equal(host.cancelledNeedIds.get(matched.needId)?.from, requester.identity.nodeId);

  const work = await provider.pollCompact({ waitMs: 0 });
  assert.equal(work.events.length, 1);
  assert.equal(work.events[0].kind, 'NEED');
  assert.equal(work.events[0].verification.ok, true);
  const scheduled = host.handleLifecycleEvent(work.events[0]);
  assert.equal(scheduled.scheduled, false);

  await Promise.resolve();
  assert.equal(executeCalls, 0);
  assert.equal(host.inFlight.has(matched.needId), false);
  assert.equal(relay.state.requests.get(matched.needId).status, 'cancelled');
});
