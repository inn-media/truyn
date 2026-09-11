import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createProviderBillingPolicy } from '../core/security/provider-billing.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { TruynAdapterHost, createFunctionAdapter } from '../adapters/sdk/index.js';
import { createRuntimeProviderBillingPolicy } from '../runtime/billing-config.js';


test('runtime billing defaults to private owner-funded', () => {
  const policy = createRuntimeProviderBillingPolicy({});
  assert.equal(policy.mode, 'owner-funded');
  assert.equal(policy.managed, false);
  assert.equal(policy.sponsoredAccess, false);
});

test('managed billing modes fail closed in the open runtime', () => {
  for (const mode of ['sponsored', 'prepaid', 'subscription']) {
    assert.throws(
      () => createRuntimeProviderBillingPolicy({ TRUYN_PROVIDER_BILLING_MODE: mode }),
      /requires TRUYN Platform runtime/
    );
    const policy = createProviderBillingPolicy({ mode });
    const requesterId = 'truyn:node:requester';
    const accessPolicy = createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: [requesterId] });
    const decision = policy.authorize({ from: requesterId }, { accessPolicy, estimatedTokens: 1 });
    assert.equal(decision.ok, false);
    assert.equal(decision.managed, true);
    assert.equal(decision.reason, 'managed_billing_requires_platform');
  }
});

test('BYOK billing requires a private provider and an access-authorized requester', () => {
  const requesterId = 'truyn:node:requester';
  const accessPolicy = createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: [requesterId] });
  const billing = createProviderBillingPolicy({ mode: 'byok' });

  assert.equal(billing.authorize({ from: requesterId }, { accessPolicy }).ok, true);
  assert.equal(billing.authorize({ from: 'truyn:node:attacker' }, { accessPolicy }).ok, false);

  const publicAccess = createProviderAccessPolicy({ mode: 'public' });
  const publicDecision = billing.authorize({ from: requesterId }, { accessPolicy: publicAccess });
  assert.equal(publicDecision.ok, false);
  assert.equal(publicDecision.reason, 'byok_provider_must_be_private');
});

test('owner-funded billing refuses a public provider even when access policy is public', () => {
  const billing = createProviderBillingPolicy({ mode: 'owner-funded' });
  const publicAccess = createProviderAccessPolicy({ mode: 'public' });
  const decision = billing.authorize({ from: 'truyn:node:external' }, { accessPolicy: publicAccess });
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, 'owner_paid_external_access_disabled');
});

test('provider-host billing gate blocks owner-funded public execution before adapter.execute()', async (t) => {
  const providerIdentity = createIdentity();
  const requesterIdentity = createIdentity();
  const relay = createRelay({ allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const providerNode = new TruynNode({ relayUrl, identity: providerIdentity });
  const requester = new TruynNode({ relayUrl, identity: requesterIdentity });
  await requester.register();

  let executions = 0;
  const adapter = createFunctionAdapter({
    capabilities: ['paid.public'],
    async execute() {
      executions += 1;
      return { output: 'should-not-run' };
    }
  });
  const host = new TruynAdapterHost({
    node: providerNode,
    adapter,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    billingPolicy: createProviderBillingPolicy({ mode: 'owner-funded' })
  });
  await host.publishCapabilities();

  const match = await requester.need('paid.public', { prompt: 'try spend' });
  assert.equal(match.provider, providerIdentity.nodeId);
  const handled = await host.runOnce();
  assert.equal(handled.handled, 1);
  assert.equal(executions, 0);

  const events = (await requester.poll()).events;
  assert.equal(events.length, 1);
  assert.equal(events[0].envelope.payload.metadata.billingDenied, true);
  assert.equal(events[0].envelope.payload.metadata.billingReason, 'owner_paid_external_access_disabled');
});

test('private BYOK billing allows only the provider-authorized requester', async (t) => {
  const providerIdentity = createIdentity();
  const requesterIdentity = createIdentity();
  const relay = createRelay({ allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const providerNode = new TruynNode({ relayUrl, identity: providerIdentity });
  const requester = new TruynNode({ relayUrl, identity: requesterIdentity });
  await requester.register();

  let executions = 0;
  const adapter = createFunctionAdapter({
    capabilities: ['byok.private'],
    async execute() {
      executions += 1;
      return { output: 'BYOK_OK' };
    }
  });
  const accessPolicy = createProviderAccessPolicy({
    mode: 'owner-only',
    allowedRequesterIds: [requesterIdentity.nodeId]
  });
  const host = new TruynAdapterHost({
    node: providerNode,
    adapter,
    accessPolicy,
    billingPolicy: createProviderBillingPolicy({ mode: 'byok' })
  });
  await host.publishCapabilities();
  await requester.need('byok.private', { prompt: 'own provider' });
  await host.runOnce();
  assert.equal(executions, 1);

  const events = (await requester.poll()).events;
  assert.equal(events[0].envelope.payload.output, 'BYOK_OK');
  assert.equal(events[0].envelope.payload.metadata.billingMode, 'byok');
  assert.equal(events[0].envelope.payload.metadata.billingResponsibility, 'provider-owner');
});
