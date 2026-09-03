import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountTenantAuthority } from '../core/security/account-tenant-authority.js';

test('account and organization lifecycle cascades through tenant resolution', () => {
  const authority = createAccountTenantAuthority({
    accounts: [{ accountId: 'acct' }],
    organizations: [{ organizationId: 'org', accountId: 'acct' }],
    tenants: [{ tenantId: 'tenant', organizationId: 'org' }],
    memberships: [{ membershipId: 'membership', principalId: 'principal', scopeType: 'tenant', scopeId: 'tenant', roles: ['member'] }],
    nodeBindings: [{ nodeId: 'node', principalId: 'principal', tenantId: 'tenant' }]
  });

  assert.equal(authority.resolveRequester('node').ok, true);

  authority.suspend('organization', 'org');
  assert.equal(authority.resolveRequester('node').reason, 'organization_suspended');
  authority.resume('organization', 'org');
  assert.equal(authority.resolveRequester('node').ok, true);

  authority.suspend('account', 'acct');
  assert.equal(authority.resolveRequester('node').reason, 'account_suspended');
  authority.resume('account', 'acct');
  assert.equal(authority.resolveRequester('node').ok, true);

  authority.setMembershipRoles('membership', ['auditor']);
  assert.equal(authority.resolveRequester('node').reason, 'requester_role_denied');
  authority.setMembershipRoles('membership', ['member']);
  assert.equal(authority.resolveRequester('node').ok, true);

  authority.remove('account', 'acct');
  assert.equal(authority.resolveRequester('node').reason, 'account_removed');
  assert.throws(() => authority.resume('account', 'acct'), /removed account cannot transition/);
});
