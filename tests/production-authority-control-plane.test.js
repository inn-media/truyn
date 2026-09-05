import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createProductionControlPlane } from '../core/security/production-control-plane.js';
import { createProviderBillingPolicy } from '../core/security/provider-billing.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

function fixture() {
  const provider = createIdentity();
  const samePrincipal = createIdentity();
  const sameTenant = createIdentity();
  const foreignTenant = createIdentity();
  const otherAccount = createIdentity();
  return {
    identities: { provider, samePrincipal, sameTenant, foreignTenant, otherAccount },
    seed: {
      accounts: [{ accountId: 'acct-a' }, { accountId: 'acct-b' }],
      organizations: [
        { organizationId: 'org-a', accountId: 'acct-a' },
        { organizationId: 'org-b', accountId: 'acct-b' }
      ],
      tenants: [
        { tenantId: 'tenant-a', organizationId: 'org-a' },
        { tenantId: 'tenant-b', organizationId: 'org-a' },
        { tenantId: 'tenant-c', organizationId: 'org-b' }
      ],
      memberships: [
        { membershipId: 'm-provider', principalId: 'principal-provider', scopeType: 'tenant', scopeId: 'tenant-a', roles: ['provider-operator', 'member'] },
        { membershipId: 'm-same', principalId: 'principal-same', scopeType: 'tenant', scopeId: 'tenant-a', roles: ['member'] },
        { membershipId: 'm-foreign', principalId: 'principal-foreign', scopeType: 'tenant', scopeId: 'tenant-b', roles: ['member'] },
        { membershipId: 'm-other', principalId: 'principal-other', scopeType: 'tenant', scopeId: 'tenant-c', roles: ['member'] }
      ],
      nodeBindings: [
        { nodeId: provider.nodeId, principalId: 'principal-provider', tenantId: 'tenant-a' },
        { nodeId: samePrincipal.nodeId, principalId: 'principal-provider', tenantId: 'tenant-a' },
        { nodeId: sameTenant.nodeId, principalId: 'principal-same', tenantId: 'tenant-a' },
        { nodeId: foreignTenant.nodeId, principalId: 'principal-foreign', tenantId: 'tenant-b' },
        { nodeId: otherAccount.nodeId, principalId: 'principal-other', tenantId: 'tenant-c' }
      ],
      providerBindings: [{ providerNodeId: provider.nodeId, providerId: 'provider-main' }]
    }
  };
}

function tempState(t) {
  const dir = mkdtempSync(join(tmpdir(), 'truyn-p1-authority-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('durable grants implement self/private/shared/network semantics and survive restart', { concurrency: false }, (t) => {
  const dir = tempState(t);
  const { identities, seed } = fixture();
  const control = createProductionControlPlane({ stateDir: dir, accountTenantSeed: seed });
  const grants = control.providerGrantAuthority;
  const providerNodeId = identities.provider.nodeId;

  grants.setProviderPolicy({ providerNodeId, mode: 'self' });
  assert.equal(grants.authorize({ providerNodeId, requesterNodeId: identities.samePrincipal.nodeId, capability: 'reasoning.secure' }).ok, true);
  assert.equal(grants.authorize({ providerNodeId, requesterNodeId: identities.sameTenant.nodeId, capability: 'reasoning.secure' }).ok, false);

  grants.setProviderPolicy({ providerNodeId, mode: 'private' });
  assert.equal(grants.authorize({ providerNodeId, requesterNodeId: identities.sameTenant.nodeId, capability: 'reasoning.secure' }).ok, true);
  assert.equal(grants.authorize({ providerNodeId, requesterNodeId: identities.foreignTenant.nodeId, capability: 'reasoning.secure' }).ok, false);

  grants.setProviderPolicy({ providerNodeId, mode: 'shared' });
  grants.createGrant({
    grantId: 'grant-foreign',
    providerNodeId,
    subjectType: 'node',
    subjectId: identities.foreignTenant.nodeId,
    capabilities: ['reasoning.secure']
  });
  assert.equal(grants.authorize({ providerNodeId, requesterNodeId: identities.foreignTenant.nodeId, capability: 'reasoning.secure' }).ok, true);
  assert.equal(grants.authorize({ providerNodeId, requesterNodeId: identities.sameTenant.nodeId, capability: 'reasoning.secure' }).ok, false);

  grants.setProviderPolicy({ providerNodeId, mode: 'network' });
  assert.equal(grants.authorize({ providerNodeId, requesterNodeId: identities.otherAccount.nodeId, capability: 'reasoning.secure' }).ok, true);

  const restarted = createProductionControlPlane({ stateDir: dir });
  assert.equal(restarted.accountTenantAuthority.resolveRequester(identities.otherAccount.nodeId).ok, true, 'account/tenant seed must persist without being supplied again');
  assert.equal(restarted.providerGrantAuthority.getProviderPolicy(providerNodeId).mode, 'network');

  restarted.providerGrantAuthority.setProviderPolicy({ providerNodeId, mode: 'shared' });
  assert.equal(restarted.providerGrantAuthority.authorize({ providerNodeId, requesterNodeId: identities.foreignTenant.nodeId, capability: 'reasoning.secure' }).ok, true);
  restarted.providerGrantAuthority.revokeGrant('grant-foreign');
  assert.equal(restarted.providerGrantAuthority.authorize({ providerNodeId, requesterNodeId: identities.foreignTenant.nodeId, capability: 'reasoning.secure' }).reason, 'shared_grant_required');

  const restartedAgain = createProductionControlPlane({ stateDir: dir });
  assert.equal(restartedAgain.revocationAuthority.isRevoked('grant', 'grant-foreign'), true);
  assert.equal(restartedAgain.providerGrantAuthority.authorize({ providerNodeId, requesterNodeId: identities.foreignTenant.nodeId, capability: 'reasoning.secure' }).ok, false);
});

test('real relay ignores provider-signed access widening and follows durable grant revocation immediately', { concurrency: false }, async (t) => {
  const dir = tempState(t);
  const { identities, seed } = fixture();
  const control = createProductionControlPlane({ stateDir: dir, accountTenantSeed: seed });
  control.providerGrantAuthority.setProviderPolicy({ providerNodeId: identities.provider.nodeId, mode: 'shared' });
  control.providerGrantAuthority.createGrant({
    grantId: 'relay-grant',
    providerNodeId: identities.provider.nodeId,
    subjectType: 'node',
    subjectId: identities.foreignTenant.nodeId,
    capabilities: ['secure.cap']
  });
  const restoreRelayAuthorities = control.configureRelay();
  t.after(restoreRelayAuthorities);

  const relay = createRelay({ allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl, identity: identities.provider });
  const authorized = new TruynNode({ relayUrl, identity: identities.foreignTenant });
  const attacker = new TruynNode({ relayUrl, identity: identities.sameTenant });
  await provider.register();
  await authorized.register();
  await attacker.register();

  await provider.offer('secure.cap', {
    accessMode: 'public',
    allowedRequesterIds: [attacker.nodeId],
    tenantId: 'tenant-forged',
    ownerId: attacker.nodeId
  });

  assert.equal((await authorized.find('secure.cap')).offers.length, 1);
  assert.equal((await attacker.find('secure.cap')).offers.length, 0, 'provider-signed public/allowlist metadata must not widen durable policy');
  assert.equal((await authorized.need('secure.cap', { prompt: 'allowed by durable grant' })).provider, identities.provider.nodeId);

  control.providerGrantAuthority.revokeGrant('relay-grant');
  assert.equal((await authorized.find('secure.cap')).offers.length, 0);
  await assert.rejects(
    authorized.need('secure.cap', { prompt: 'revoked' }),
    (error) => error.status === 404 && error.body?.error === 'no_matching_provider'
  );
});

test('entitlement authority and durable accounting reserve, reconcile and persist without double spend', { concurrency: false }, (t) => {
  const dir = tempState(t);
  const { identities, seed } = fixture();
  const control = createProductionControlPlane({ stateDir: dir, accountTenantSeed: seed });
  control.entitlementAuthority.createEntitlement({
    entitlementId: 'sub-1',
    subjectType: 'node',
    subjectId: identities.foreignTenant.nodeId,
    providerNodeId: identities.provider.nodeId,
    capabilities: ['secure.cap'],
    mode: 'subscription',
    period: 'day',
    maxRequests: 3,
    maxTokens: 100,
    billingResponsibility: 'requester'
  });

  const accessPolicy = { mode: 'owner-only', authorize: () => ({ ok: true }) };
  const billing = createProviderBillingPolicy({
    mode: 'subscription',
    providerNodeId: identities.provider.nodeId,
    entitlementAuthority: control.entitlementAuthority,
    accountingAuthority: control.accountingAuthority
  });

  const need = (id) => ({ id, from: identities.foreignTenant.nodeId, payload: { capability: { name: 'secure.cap' }, policy: {} } });
  const first = billing.authorize(need('need-1'), { accessPolicy, estimatedTokens: 40 });
  assert.equal(first.ok, true);
  const duplicate = billing.authorize(need('need-1'), { accessPolicy, estimatedTokens: 40 });
  assert.equal(duplicate.ok, true, 'same reservation id and shape must be idempotent');
  assert.equal(first.finalize({ outcome: 'completed', actualTokens: 30 }).ok, true);
  assert.equal(first.finalize({ outcome: 'completed', actualTokens: 30 }).idempotent, true);

  const second = billing.authorize(need('need-2'), { accessPolicy, estimatedTokens: 60 });
  assert.equal(second.ok, true);
  const overspend = billing.authorize(need('need-3'), { accessPolicy, estimatedTokens: 20 });
  assert.equal(overspend.ok, false);
  assert.equal(overspend.reason, 'token_quota_exhausted');
  assert.equal(second.finalize({ outcome: 'failed', actualTokens: 0 }).ok, true);

  const third = billing.authorize(need('need-3'), { accessPolicy, estimatedTokens: 20 });
  assert.equal(third.ok, true);
  assert.equal(third.finalize({ outcome: 'completed', actualTokens: 20 }).ok, true);

  const restarted = createProductionControlPlane({ stateDir: dir });
  assert.equal(restarted.entitlementAuthority.resolve({
    requesterNodeId: identities.foreignTenant.nodeId,
    providerNodeId: identities.provider.nodeId,
    capability: 'secure.cap',
    mode: 'subscription'
  }).ok, true);
  assert.equal(restarted.accountingAuthority.getReservation('need-1').status, 'committed');
  assert.equal(restarted.accountingAuthority.getReservation('need-2').status, 'released');
  assert.equal(restarted.accountingAuthority.getReservation('need-3').status, 'committed');

  restarted.entitlementAuthority.revokeEntitlement('sub-1');
  assert.equal(restarted.entitlementAuthority.resolve({
    requesterNodeId: identities.foreignTenant.nodeId,
    providerNodeId: identities.provider.nodeId,
    capability: 'secure.cap',
    mode: 'subscription'
  }).reason, 'entitlement_not_found');

  const restartedAgain = createProductionControlPlane({ stateDir: dir });
  assert.equal(restartedAgain.revocationAuthority.isRevoked('entitlement', 'sub-1'), true);
});

test('production revocation is terminal, durable and fail-closed across grant and entitlement authority', { concurrency: false }, (t) => {
  const dir = tempState(t);
  const { identities, seed } = fixture();
  const control = createProductionControlPlane({ stateDir: dir, accountTenantSeed: seed });
  control.providerGrantAuthority.setProviderPolicy({ providerNodeId: identities.provider.nodeId, mode: 'network' });
  control.entitlementAuthority.createEntitlement({
    entitlementId: 'prepaid-1',
    subjectType: 'node',
    subjectId: identities.foreignTenant.nodeId,
    providerNodeId: identities.provider.nodeId,
    capabilities: ['secure.cap'],
    mode: 'prepaid',
    period: 'lifetime',
    maxRequests: 10,
    maxTokens: 1000
  });

  assert.equal(control.providerGrantAuthority.authorize({
    providerNodeId: identities.provider.nodeId,
    requesterNodeId: identities.foreignTenant.nodeId,
    capability: 'secure.cap'
  }).ok, true);
  assert.equal(control.entitlementAuthority.resolve({
    requesterNodeId: identities.foreignTenant.nodeId,
    providerNodeId: identities.provider.nodeId,
    capability: 'secure.cap',
    mode: 'prepaid'
  }).ok, true);

  control.revocationAuthority.revoke('node', identities.foreignTenant.nodeId, { reason: 'security_incident' });
  assert.equal(control.providerGrantAuthority.authorize({
    providerNodeId: identities.provider.nodeId,
    requesterNodeId: identities.foreignTenant.nodeId,
    capability: 'secure.cap'
  }).reason, 'node_revoked');
  assert.equal(control.entitlementAuthority.resolve({
    requesterNodeId: identities.foreignTenant.nodeId,
    providerNodeId: identities.provider.nodeId,
    capability: 'secure.cap',
    mode: 'prepaid'
  }).reason, 'node_revoked');

  const restarted = createProductionControlPlane({ stateDir: dir });
  assert.equal(restarted.revocationAuthority.isRevoked('node', identities.foreignTenant.nodeId), true);
  assert.equal(restarted.providerGrantAuthority.authorize({
    providerNodeId: identities.provider.nodeId,
    requesterNodeId: identities.foreignTenant.nodeId,
    capability: 'secure.cap'
  }).ok, false);
});

test('corrupt durable grant state fails closed instead of falling back to OFFER metadata', { concurrency: false }, (t) => {
  const dir = tempState(t);
  const { identities, seed } = fixture();
  const control = createProductionControlPlane({ stateDir: dir, accountTenantSeed: seed });
  control.providerGrantAuthority.setProviderPolicy({ providerNodeId: identities.provider.nodeId, mode: 'network' });
  writeFileSync(join(dir, 'provider-grants.json'), '{not-json', 'utf8');
  assert.equal(control.providerGrantAuthority.authorize({
    providerNodeId: identities.provider.nodeId,
    requesterNodeId: identities.foreignTenant.nodeId,
    capability: 'secure.cap'
  }).reason, 'provider_grant_state_unavailable');
});
