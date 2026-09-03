import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createAccountTenantAuthority } from '../core/security/account-tenant-authority.js';
import {
  configureRelayAccountTenantAuthority,
  providerPolicyAllowsRequester,
  providerPolicyFromOffer
} from '../core/security/relay-provider-policy.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

function baseAuthority(extra = {}) {
  return createAccountTenantAuthority({
    accounts: [{ accountId: 'acct-1' }],
    organizations: [{ organizationId: 'org-1', accountId: 'acct-1' }],
    tenants: [
      { tenantId: 'tenant-a', organizationId: 'org-1' },
      { tenantId: 'tenant-b', organizationId: 'org-1' }
    ],
    ...extra
  });
}

test('account/org/tenant scoped memberships resolve inherited roles authoritatively', () => {
  const authority = baseAuthority({
    memberships: [
      { membershipId: 'm-owner', principalId: 'alice', scopeType: 'account', scopeId: 'acct-1', roles: ['account-owner'] },
      { membershipId: 'm-auditor', principalId: 'eve', scopeType: 'organization', scopeId: 'org-1', roles: ['auditor'] }
    ],
    nodeBindings: [
      { nodeId: 'node-alice', principalId: 'alice', tenantId: 'tenant-b' },
      { nodeId: 'node-eve', principalId: 'eve', tenantId: 'tenant-a' }
    ],
    providerBindings: [{ providerNodeId: 'node-alice', providerId: 'provider-a' }]
  });

  const requester = authority.resolveRequester('node-alice');
  assert.equal(requester.ok, true);
  assert.equal(requester.accountId, 'acct-1');
  assert.equal(requester.organizationId, 'org-1');
  assert.equal(requester.tenantId, 'tenant-b');
  assert.deepEqual(requester.roles, ['account-owner']);

  const provider = authority.resolveProvider('node-alice');
  assert.equal(provider.ok, true);
  assert.equal(provider.providerId, 'provider-a');

  assert.deepEqual(authority.resolveRequester('node-eve'), { ok: false, reason: 'requester_role_denied' });
});

test('membership, tenant and provider lifecycle changes fail closed immediately', () => {
  const authority = baseAuthority({
    memberships: [{ membershipId: 'm-provider', principalId: 'alice', scopeType: 'tenant', scopeId: 'tenant-a', roles: ['provider-operator', 'member'] }],
    nodeBindings: [{ nodeId: 'node-a', principalId: 'alice', tenantId: 'tenant-a' }],
    providerBindings: [{ providerNodeId: 'node-a', providerId: 'provider-a' }]
  });

  assert.equal(authority.resolveRequester('node-a').ok, true);
  assert.equal(authority.resolveProvider('node-a').ok, true);

  authority.suspend('membership', 'm-provider');
  assert.equal(authority.resolveRequester('node-a').reason, 'active_membership_required');
  assert.equal(authority.resolveProvider('node-a').reason, 'active_membership_required');
  authority.resume('membership', 'm-provider');
  assert.equal(authority.resolveProvider('node-a').ok, true);

  authority.suspend('tenant', 'tenant-a');
  assert.equal(authority.resolveRequester('node-a').reason, 'tenant_suspended');
  authority.resume('tenant', 'tenant-a');

  authority.suspend('provider', 'node-a');
  assert.equal(authority.resolveProvider('node-a').reason, 'provider_binding_suspended');
  authority.resume('provider', 'node-a');
  assert.equal(authority.resolveProvider('node-a').ok, true);

  authority.remove('node', 'node-a');
  assert.equal(authority.resolveRequester('node-a').reason, 'node_binding_removed');
  assert.throws(() => authority.resume('node', 'node-a'), /removed node cannot transition/);
});

test('provider binding cannot escape its authoritative node principal or tenant', () => {
  const authority = baseAuthority({
    memberships: [{ membershipId: 'm-provider', principalId: 'alice', scopeType: 'tenant', scopeId: 'tenant-a', roles: ['provider-operator'] }],
    nodeBindings: [{ nodeId: 'provider-node', principalId: 'alice', tenantId: 'tenant-a' }]
  });

  assert.throws(() => authority.bindProvider({
    providerNodeId: 'provider-node',
    providerId: 'provider-a',
    principalId: 'mallory',
    tenantId: 'tenant-b'
  }), /must match its node principal and tenant/);
});

test('relay provider policy validates authoritative tenant state without turning tenant membership into entitlement', (t) => {
  const authority = baseAuthority({
    memberships: [
      { membershipId: 'm-provider', principalId: 'provider-user', scopeType: 'tenant', scopeId: 'tenant-a', roles: ['provider-operator'] },
      { membershipId: 'm-same', principalId: 'same-user', scopeType: 'tenant', scopeId: 'tenant-a', roles: ['member'] },
      { membershipId: 'm-same-ungranted', principalId: 'same-ungranted-user', scopeType: 'tenant', scopeId: 'tenant-a', roles: ['member'] },
      { membershipId: 'm-foreign', principalId: 'foreign-user', scopeType: 'tenant', scopeId: 'tenant-b', roles: ['member'] }
    ],
    nodeBindings: [
      { nodeId: 'provider-node', principalId: 'provider-user', tenantId: 'tenant-a' },
      { nodeId: 'same-node', principalId: 'same-user', tenantId: 'tenant-a' },
      { nodeId: 'same-ungranted-node', principalId: 'same-ungranted-user', tenantId: 'tenant-a' },
      { nodeId: 'foreign-node', principalId: 'foreign-user', tenantId: 'tenant-b' }
    ],
    providerBindings: [{ providerNodeId: 'provider-node', providerId: 'provider-a' }]
  });
  configureRelayAccountTenantAuthority(authority);
  t.after(() => configureRelayAccountTenantAuthority(null));

  const policy = providerPolicyFromOffer({
    from: 'provider-node',
    payload: { metadata: {
      accessMode: 'owner-only',
      tenantId: 'tenant-b',
      ownerId: 'mallory',
      allowedRequesterIds: ['same-node']
    } }
  });

  assert.equal(providerPolicyAllowsRequester(policy, 'same-node'), true);
  assert.equal(providerPolicyAllowsRequester(policy, 'same-ungranted-node'), false);
  assert.equal(providerPolicyAllowsRequester(policy, 'foreign-node'), false);
  authority.suspend('membership', 'm-same');
  assert.equal(providerPolicyAllowsRequester(policy, 'same-node'), false);
});

test('real relay discovery and dispatch combine authoritative membership lifecycle with explicit provider access', async (t) => {
  const providerIdentity = createIdentity();
  const sameTenantIdentity = createIdentity();
  const sameTenantUngrantedIdentity = createIdentity();
  const foreignIdentity = createIdentity();
  const authority = baseAuthority({
    memberships: [
      { membershipId: 'm-provider', principalId: 'provider-user', scopeType: 'tenant', scopeId: 'tenant-a', roles: ['provider-operator'] },
      { membershipId: 'm-same', principalId: 'same-user', scopeType: 'tenant', scopeId: 'tenant-a', roles: ['member'] },
      { membershipId: 'm-same-ungranted', principalId: 'same-ungranted-user', scopeType: 'tenant', scopeId: 'tenant-a', roles: ['member'] },
      { membershipId: 'm-foreign', principalId: 'foreign-user', scopeType: 'tenant', scopeId: 'tenant-b', roles: ['member'] }
    ],
    nodeBindings: [
      { nodeId: providerIdentity.nodeId, principalId: 'provider-user', tenantId: 'tenant-a' },
      { nodeId: sameTenantIdentity.nodeId, principalId: 'same-user', tenantId: 'tenant-a' },
      { nodeId: sameTenantUngrantedIdentity.nodeId, principalId: 'same-ungranted-user', tenantId: 'tenant-a' },
      { nodeId: foreignIdentity.nodeId, principalId: 'foreign-user', tenantId: 'tenant-b' }
    ],
    providerBindings: [{ providerNodeId: providerIdentity.nodeId, providerId: 'provider-a' }]
  });
  configureRelayAccountTenantAuthority(authority);
  t.after(() => configureRelayAccountTenantAuthority(null));

  const relay = createRelay({ allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl, identity: providerIdentity });
  const sameTenant = new TruynNode({ relayUrl, identity: sameTenantIdentity });
  const sameTenantUngranted = new TruynNode({ relayUrl, identity: sameTenantUngrantedIdentity });
  const foreign = new TruynNode({ relayUrl, identity: foreignIdentity });
  await provider.register();
  await sameTenant.register();
  await sameTenantUngranted.register();
  await foreign.register();

  await provider.offer('tenant.private', {
    accessMode: 'owner-only',
    tenantId: 'tenant-b',
    ownerId: 'forged-owner',
    allowedRequesterIds: [sameTenantIdentity.nodeId]
  });

  assert.equal((await sameTenant.find('tenant.private')).offers.length, 1);
  assert.equal((await sameTenantUngranted.find('tenant.private')).offers.length, 0);
  assert.equal((await foreign.find('tenant.private')).offers.length, 0);

  const matched = await sameTenant.need('tenant.private', { prompt: 'authorized explicit requester' });
  assert.equal(matched.provider, providerIdentity.nodeId);

  authority.suspend('membership', 'm-same');
  assert.equal((await sameTenant.find('tenant.private')).offers.length, 0);
  await assert.rejects(
    sameTenant.need('tenant.private', { prompt: 'must fail after suspension' }),
    (error) => error.status === 404 && error.body?.error === 'no_matching_provider'
  );
});
