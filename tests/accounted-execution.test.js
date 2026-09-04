import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createProductionControlPlane } from '../core/security/production-control-plane.js';
import { executeWithDurableAccounting } from '../core/security/accounted-execution.js';

function setup(t) {
  const provider = createIdentity();
  const requester = createIdentity();
  const dir = mkdtempSync(join(tmpdir(), 'truyn-accounted-execution-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const control = createProductionControlPlane({
    stateDir: dir,
    accountTenantSeed: {
      accounts: [{ accountId: 'acct' }],
      organizations: [{ organizationId: 'org', accountId: 'acct' }],
      tenants: [{ tenantId: 'tenant', organizationId: 'org' }],
      memberships: [
        { membershipId: 'provider-membership', principalId: 'provider-principal', scopeType: 'tenant', scopeId: 'tenant', roles: ['provider-operator', 'member'] },
        { membershipId: 'requester-membership', principalId: 'requester-principal', scopeType: 'tenant', scopeId: 'tenant', roles: ['member'] }
      ],
      nodeBindings: [
        { nodeId: provider.nodeId, principalId: 'provider-principal', tenantId: 'tenant' },
        { nodeId: requester.nodeId, principalId: 'requester-principal', tenantId: 'tenant' }
      ],
      providerBindings: [{ providerNodeId: provider.nodeId, providerId: 'provider' }]
    }
  });
  control.entitlementAuthority.createEntitlement({
    entitlementId: 'subscription',
    subjectType: 'node',
    subjectId: requester.nodeId,
    providerNodeId: provider.nodeId,
    capabilities: ['reasoning.accounted'],
    mode: 'subscription',
    period: 'day',
    maxRequests: 10,
    maxTokens: 100
  });
  const billingPolicy = control.createBillingPolicy({ providerNodeId: provider.nodeId, mode: 'subscription' });
  const accessPolicy = { mode: 'owner-only', authorize: () => ({ ok: true }) };
  const need = (id) => ({ id, from: requester.nodeId, payload: { capability: { name: 'reasoning.accounted' }, policy: {} } });
  return { control, billingPolicy, accessPolicy, need };
}

test('accounted execution commits provider-reported totalTokens and releases failed execution', { concurrency: false }, async (t) => {
  const { control, billingPolicy, accessPolicy, need } = setup(t);

  const completed = await executeWithDurableAccounting({
    billingPolicy,
    need: need('need-completed'),
    accessPolicy,
    estimatedTokens: 50,
    execute: async () => ({ output: 'ok', metadata: { totalTokens: 30 } })
  });
  assert.equal(completed.ok, true);
  assert.equal(completed.actualTokens, 30);
  assert.equal(control.accountingAuthority.getReservation('need-completed').status, 'committed');
  assert.equal(control.accountingAuthority.getReservation('need-completed').actualTokens, 30);

  await assert.rejects(
    executeWithDurableAccounting({
      billingPolicy,
      need: need('need-failed'),
      accessPolicy,
      estimatedTokens: 20,
      execute: async () => { throw new Error('provider_failed'); }
    }),
    /provider_failed/
  );
  assert.equal(control.accountingAuthority.getReservation('need-failed').status, 'released');
});

test('actual usage overrun is durably accounted and poisons later quota instead of disappearing', { concurrency: false }, async (t) => {
  const { control, billingPolicy, accessPolicy, need } = setup(t);

  await executeWithDurableAccounting({
    billingPolicy,
    need: need('need-base'),
    accessPolicy,
    estimatedTokens: 30,
    execute: async () => ({ output: 'base', metadata: { usage: { total: 30 } } })
  });

  await assert.rejects(
    executeWithDurableAccounting({
      billingPolicy,
      need: need('need-overrun'),
      accessPolicy,
      estimatedTokens: 20,
      execute: async () => ({ output: 'overrun', metadata: { totalTokens: 80 } })
    }),
    (error) => error.code === 'actual_token_quota_exceeded' && error.reconciliation?.accounted === true
  );

  const overrun = control.accountingAuthority.getReservation('need-overrun');
  assert.equal(overrun.status, 'committed');
  assert.equal(overrun.actualTokens, 80);
  assert.equal(overrun.quotaOverrun, true);

  const denied = billingPolicy.authorize(need('need-after-overrun'), { accessPolicy, estimatedTokens: 1 });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'token_quota_exhausted');

  const snapshot = control.accountingAuthority.snapshot();
  const ledger = snapshot.ledgers[Object.keys(snapshot.ledgers)[0]];
  assert.equal(ledger.committedTokens, 110);
  assert.equal(ledger.quotaOverruns, 1);
});
