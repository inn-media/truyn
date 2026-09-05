import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createProductionControlPlane } from '../core/security/production-control-plane.js';
import { createDurableJsonStore } from '../core/security/durable-json-store.js';
import { TruynAdapterHost, createFunctionAdapter } from '../adapters/sdk/index.js';

function tempDir(t, prefix = 'truyn-authority-correctness-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function authorityFixture(t, suffix = '') {
  const provider = createIdentity();
  const requester = createIdentity();
  const stateDir = tempDir(t, `truyn-authority-${suffix}-`);
  const control = createProductionControlPlane({
    stateDir,
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
  control.providerGrantAuthority.setProviderPolicy({ providerNodeId: provider.nodeId, mode: 'network' });
  control.entitlementAuthority.createEntitlement({
    entitlementId: 'subscription',
    subjectType: 'node',
    subjectId: requester.nodeId,
    providerNodeId: provider.nodeId,
    capabilities: ['reasoning.secure'],
    mode: 'subscription',
    period: 'day',
    maxRequests: 10,
    maxTokens: 100
  });
  return { control, provider, requester };
}

function grantDecision(control, provider, requester) {
  return control.providerGrantAuthority.authorize({
    providerNodeId: provider.nodeId,
    requesterNodeId: requester.nodeId,
    capability: 'reasoning.secure'
  });
}

function entitlementDecision(control, provider, requester) {
  return control.entitlementAuthority.resolve({
    requesterNodeId: requester.nodeId,
    providerNodeId: provider.nodeId,
    capability: 'reasoning.secure',
    mode: 'subscription'
  });
}

test('terminal membership revocation denies both requester and provider authorization paths', { concurrency: false }, (t) => {
  const requesterCase = authorityFixture(t, 'requester');
  assert.equal(grantDecision(requesterCase.control, requesterCase.provider, requesterCase.requester).ok, true);
  assert.equal(entitlementDecision(requesterCase.control, requesterCase.provider, requesterCase.requester).ok, true);
  requesterCase.control.revocationAuthority.revoke('membership', 'requester-membership', { reason: 'membership_removed' });
  assert.equal(grantDecision(requesterCase.control, requesterCase.provider, requesterCase.requester).reason, 'membership_revoked');
  assert.equal(entitlementDecision(requesterCase.control, requesterCase.provider, requesterCase.requester).reason, 'membership_revoked');

  const providerCase = authorityFixture(t, 'provider');
  assert.equal(grantDecision(providerCase.control, providerCase.provider, providerCase.requester).ok, true);
  assert.equal(entitlementDecision(providerCase.control, providerCase.provider, providerCase.requester).ok, true);
  providerCase.control.revocationAuthority.revoke('membership', 'provider-membership', { reason: 'provider_membership_removed' });
  assert.equal(grantDecision(providerCase.control, providerCase.provider, providerCase.requester).reason, 'membership_revoked');
  assert.equal(entitlementDecision(providerCase.control, providerCase.provider, providerCase.requester).reason, 'membership_revoked');
});

test('a committed reservation id cannot authorize provider execution again', { concurrency: false }, (t) => {
  const { control, provider, requester } = authorityFixture(t, 'replay');
  const billing = control.createBillingPolicy({ providerNodeId: provider.nodeId, mode: 'subscription' });
  const accessPolicy = { mode: 'owner-only', authorize: () => ({ ok: true }) };
  const need = {
    id: 'need-once',
    from: requester.nodeId,
    payload: { capability: { name: 'reasoning.secure' }, policy: { billing: { maxTokens: 10 } } }
  };

  const first = billing.authorize(need, { accessPolicy, estimatedTokens: 10 });
  assert.equal(first.ok, true);
  assert.equal(first.finalize({ outcome: 'completed', actualTokens: 7 }).ok, true);

  const replay = billing.authorize(need, { accessPolicy, estimatedTokens: 10 });
  assert.equal(replay.ok, false);
  assert.equal(replay.reason, 'reservation_already_committed');
  assert.equal(control.accountingAuthority.getReservation('need-once').actualTokens, 7);
});

test('stale-looking lock owned by a live process is not stolen or unlinked', { concurrency: false }, (t) => {
  const dir = tempDir(t, 'truyn-authority-lock-');
  const filePath = join(dir, 'state.json');
  const lockPath = `${filePath}.lock`;
  writeFileSync(lockPath, JSON.stringify({ pid: process.pid, owner: 'foreign-live-owner', acquiredAt: '2000-01-01T00:00:00.000Z' }), 'utf8');
  const old = new Date(Date.now() - 60_000);
  utimesSync(lockPath, old, old);

  const store = createDurableJsonStore({ filePath, lockTimeoutMs: 20, staleLockMs: 20 });
  assert.throws(
    () => store.transaction((state) => { state.value = 1; }),
    (error) => error?.code === 'durable_lock_timeout'
  );
  assert.equal(existsSync(lockPath), true);
  assert.equal(JSON.parse(readFileSync(lockPath, 'utf8')).owner, 'foreign-live-owner');
});

function fakeNode(event) {
  const results = [];
  return {
    results,
    sessionToken: null,
    async register() { this.sessionToken = 'session'; return { sessionToken: this.sessionToken }; },
    async offer() { return { offerId: 'offer-1' }; },
    async poll() { return { events: [event] }; },
    async result(id, output, metadata) { results.push({ id, output, metadata }); return { ok: true }; }
  };
}

function needEvent(id = 'need-1') {
  return {
    kind: 'NEED',
    verification: { ok: true },
    envelope: {
      id,
      from: 'truyn:node:requester',
      payload: {
        capability: { name: 'reasoning.secure' },
        input: { prompt: 'test' },
        policy: { billing: { maxTokens: 10 } }
      }
    }
  };
}

function billingPolicy(finalizations) {
  return {
    mode: 'subscription',
    authorize() {
      return {
        ok: true,
        mode: 'subscription',
        billingResponsibility: 'requester',
        reservedTokens: 10,
        finalize(input) {
          finalizations.push(input);
          return {
            ok: true,
            status: input.outcome === 'completed' ? 'committed' : 'released',
            accounted: input.outcome === 'completed'
          };
        }
      };
    }
  };
}

const allowAccess = { mode: 'owner-only', authorize: () => ({ ok: true }) };

test('provider host finalizes durable billing on success and failure', async () => {
  const successFinalizations = [];
  const successNode = fakeNode(needEvent('need-success'));
  const successHost = new TruynAdapterHost({
    node: successNode,
    accessPolicy: allowAccess,
    billingPolicy: billingPolicy(successFinalizations),
    adapter: createFunctionAdapter({
      capabilities: ['reasoning.secure'],
      async execute() { return { output: 'ok', metadata: { usage: { total_tokens: 7 } } }; }
    })
  });
  await successHost.runOnce();
  assert.deepEqual(successFinalizations, [{ outcome: 'completed', actualTokens: 7 }]);
  assert.equal(successNode.results[0].output, 'ok');
  assert.equal(successNode.results[0].metadata.billingAccountingStatus, 'committed');

  const failureFinalizations = [];
  const failureNode = fakeNode(needEvent('need-failure'));
  const failureHost = new TruynAdapterHost({
    node: failureNode,
    accessPolicy: allowAccess,
    billingPolicy: billingPolicy(failureFinalizations),
    adapter: createFunctionAdapter({
      capabilities: ['reasoning.secure'],
      async execute() { throw new Error('provider_failed'); }
    })
  });
  await failureHost.runOnce();
  assert.equal(failureFinalizations.length, 1);
  assert.equal(failureFinalizations[0].outcome, 'failed');
  assert.equal(failureFinalizations[0].actualTokens, 0);
  assert.equal(failureNode.results[0].metadata.failed, true);
  assert.equal(failureNode.results[0].metadata.billingAccountingStatus, 'released');
});

test('provider stop releases an in-flight durable reservation as cancelled', async () => {
  const finalizations = [];
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const host = new TruynAdapterHost({
    node: {},
    accessPolicy: allowAccess,
    billingPolicy: billingPolicy(finalizations),
    executionDrainTimeoutMs: 1000,
    adapter: createFunctionAdapter({
      capabilities: ['reasoning.secure'],
      execute({ signal }) {
        started();
        return new Promise((resolve, reject) => {
          const abort = () => reject(signal.reason || new Error('cancelled'));
          if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
        });
      }
    })
  });

  const scheduled = host.handleLifecycleEvent(needEvent('need-cancel'));
  assert.equal(scheduled.scheduled, true);
  await startedPromise;
  await host.stop();
  await scheduled.promise;
  assert.equal(finalizations.length, 1);
  assert.equal(finalizations[0].outcome, 'cancelled');
  assert.equal(finalizations[0].actualTokens, 0);
});
