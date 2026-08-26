import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createA2aServer } from '../adapters/a2a/server.js';
import { createA2aDiscoveryProvider } from '../adapters/providers/a2a-discovery.js';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runHostUntilHandled(host, { timeoutMs = 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await host.runOnce();
    if (result.handled > 0) return result;
    await delay(2);
  }
  throw new Error('provider host did not receive the long-running C5 NEED');
}

test('C5 real C3→TRUYN→provider lifecycle completes through returnImmediately + GetTask without duplicate execution', async (t) => {
  const relay = createRelay({
    localDevelopmentMode: false,
    allowPublicRegistration: true,
    allowPublicDispatch: true
  });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  let providerExecutions = 0;
  const providerNode = new TruynNode({ relayUrl, identity: createIdentity() });
  const providerHost = new TruynAdapterHost({
    node: providerNode,
    adapter: createFunctionAdapter({
      name: 'c5-real-long-provider',
      capabilities: ['remote.long-job'],
      execute: async ({ input }) => {
        providerExecutions += 1;
        await delay(20);
        return { output: { answer: `done:${input.parts[0].data.job}` } };
      }
    }),
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    pollIntervalMs: 2
  });
  await providerHost.start();
  t.after(() => providerHost.stop());

  const facadeNode = new TruynNode({ relayUrl, identity: createIdentity() });
  const facade = createA2aServer({
    node: facadeNode,
    agent: {
      name: 'C5 real async facade',
      description: 'Real C3 facade used by the C5 long-running lifecycle proof',
      version: '1.0.0'
    },
    skills: [{
      id: 'long-job',
      name: 'Long job',
      description: 'Long-running job through the real TRUYN provider path',
      capability: 'remote.long-job',
      visibility: 'public',
      inputModes: ['application/json'],
      outputModes: ['application/json']
    }],
    allowAnonymousTaskAccess: true,
    pollIntervalMs: 2
  });
  const facadeUrl = await facade.listen({ port: 0 });
  t.after(() => facade.close());

  const imported = await createA2aDiscoveryProvider({
    agentCardUrl: `${facadeUrl}/.well-known/agent-card.json`,
    allowSkills: ['long-job'],
    taskExecutionMode: 'polling',
    pollIntervalMs: 2,
    taskTimeoutMs: 1000
  });

  const providerWork = runHostUntilHandled(providerHost);
  const result = await imported.execute({
    capability: 'a2a.long-job',
    input: { job: 'c5' }
  });
  await providerWork;

  assert.deepEqual(result.output, { answer: 'done:c5' });
  assert.equal(providerExecutions, 1, 'polling must track one task, never re-dispatch provider work');
  assert.equal(result.metadata.interoperability.taskExecutionMode, 'polling');
  assert.ok(result.metadata.interoperability.taskPollCount >= 1, 'real delayed provider must require at least one GetTask poll');
  assert.ok(result.metadata.interoperability.remoteTaskId);
  assert.ok(result.metadata.interoperability.remoteContextId);
});
