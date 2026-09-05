import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { executeWithDurableAccounting } from '../core/security/accounted-execution.js';
import { TruynAdapterHost, createFunctionAdapter } from '../adapters/sdk/index.js';
import { createRuntimeProviderBillingPolicy } from '../runtime/billing-config.js';
import { createManagedProviderBillingPolicy } from '../runtime/managed-billing-policy.js';

function need(id = 'managed-need', maxTokens = 50) {
  return {
    id,
    from: 'truyn:node:requester',
    payload: {
      capability: { name: 'managed.test' },
      input: { prompt: 'managed accounting' },
      policy: { billing: { maxTokens } }
    }
  };
}

function fakeNode(events = []) {
  const terminals = [];
  return {
    sessionToken: null,
    terminals,
    async register() { this.sessionToken = 'session'; },
    async offer() { return { offerId: 'offer-managed' }; },
    async poll() { return { events }; },
    async result(id, output, metadata) { terminals.push({ id, output, metadata }); return { ok: true }; },
    async compactResult(id, output, metadata) { terminals.push({ id, output, metadata }); return { ok: true }; },
    async materializeContextRefs(input) { return { value: input, stats: { contextRefs: 0 } }; }
  };
}

function eventFor(value) {
  return { kind: 'NEED', verification: { ok: true }, envelope: value };
}

function successfulAuthorityClient({ calls = [], reconcile = null } = {}) {
  const committed = new Set();
  return {
    async reserveBilling(input) {
      calls.push({ kind: 'reserve', input });
      if (committed.has(input.need.id)) return { ok: false, reason: 'reservation_already_committed' };
      return {
        ok: true,
        accountingReservationId: input.need.id,
        reservedTokens: input.estimatedTokens,
        billingResponsibility: 'requester-prepaid',
        authorityRevision: 7,
        authorityStateDigest: 'a'.repeat(64)
      };
    },
    async reconcileBilling(input) {
      calls.push({ kind: 'reconcile', input });
      if (reconcile) return reconcile(input);
      if (input.outcome === 'completed') committed.add(input.reservationId);
      return { ok: true, status: input.outcome === 'completed' ? 'committed' : 'released', accounted: input.outcome === 'completed' };
    }
  };
}

function managedPolicy(client, mode = 'prepaid') {
  return createManagedProviderBillingPolicy({
    client,
    providerNodeId: 'truyn:node:provider',
    mode
  });
}

test('runtime routes sponsored/prepaid/subscription through managed authority while owner-funded/BYOK stay local-only', async () => {
  const authorityClient = successfulAuthorityClient();
  for (const mode of ['sponsored', 'prepaid', 'subscription']) {
    const policy = createRuntimeProviderBillingPolicy({
      TRUYN_PROVIDER_BILLING_MODE: mode,
      TRUYN_AUTHORITY_URL: 'https://authority.invalid',
      TRUYN_AUTHORITY_RUNTIME_TOKEN: 'runtime-token'
    }, { authorityClient, providerNodeId: 'truyn:node:provider' });
    assert.equal(policy.mode, mode);
    assert.equal(policy.managed, true);
  }

  const ownerAccess = createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: ['truyn:node:requester'] });
  for (const mode of ['owner-funded', 'byok']) {
    const policy = createRuntimeProviderBillingPolicy({
      TRUYN_PROVIDER_BILLING_MODE: mode,
      TRUYN_AUTHORITY_URL: 'https://authority.invalid'
    }, { authorityClient, providerNodeId: 'truyn:node:provider' });
    assert.notEqual(policy.managed, true);
    assert.equal(policy.authorize(need(`local-${mode}`), { accessPolicy: ownerAccess }).ok, true);
  }
});

test('managed authority reserve denial happens before remote provider execution', async () => {
  let executions = 0;
  const node = fakeNode([eventFor(need('reserve-denied'))]);
  const policy = managedPolicy({
    async reserveBilling() { return { ok: false, reason: 'token_quota_exhausted' }; },
    async reconcileBilling() { throw new Error('must not reconcile denied reservation'); }
  });
  const host = new TruynAdapterHost({
    node,
    adapter: createFunctionAdapter({ capabilities: ['managed.test'], async execute() { executions += 1; return { output: 'NO' }; } }),
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    billingPolicy: policy
  });

  await host.runOnce();
  assert.equal(executions, 0);
  assert.equal(node.terminals.length, 1);
  assert.equal(node.terminals[0].output, null);
  assert.equal(node.terminals[0].metadata.billingReason, 'token_quota_exhausted');
});

test('managed success is reserve -> execute exactly once -> reconcile actual usage -> terminal and committed request cannot replay', async () => {
  const calls = [];
  const client = successfulAuthorityClient({ calls });
  const request = need('managed-once', 50);
  const node = fakeNode([eventFor(request)]);
  let executions = 0;
  const host = new TruynAdapterHost({
    node,
    adapter: createFunctionAdapter({
      capabilities: ['managed.test'],
      async execute() {
        calls.push({ kind: 'execute' });
        executions += 1;
        return { output: 'PAID_OK', metadata: { usage: { totalTokens: 17 } } };
      }
    }),
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    billingPolicy: managedPolicy(client)
  });

  await host.runOnce();
  calls.push({ kind: 'terminal' });
  assert.equal(executions, 1);
  assert.deepEqual(calls.map((entry) => entry.kind), ['reserve', 'execute', 'reconcile', 'terminal']);
  assert.equal(calls[0].input.need.id, 'managed-once');
  assert.equal(calls[2].input.reservationId, 'managed-once');
  assert.equal(calls[2].input.outcome, 'completed');
  assert.equal(calls[2].input.actualTokens, 17);
  assert.equal(node.terminals[0].output, 'PAID_OK');
  assert.equal(node.terminals[0].metadata.billingAccountingStatus, 'committed');
  assert.equal(node.terminals[0].metadata.billingAccounted, true);

  node.sessionToken = 'session';
  node.poll = async () => ({ events: [eventFor(request)] });
  await host.runOnce();
  assert.equal(executions, 1);
  assert.equal(node.terminals[1].output, null);
  assert.equal(node.terminals[1].metadata.billingReason, 'reservation_already_committed');
});

test('provider failure releases managed reservation', async () => {
  const calls = [];
  const node = fakeNode([eventFor(need('provider-failed'))]);
  const host = new TruynAdapterHost({
    node,
    adapter: createFunctionAdapter({ capabilities: ['managed.test'], async execute() { throw new Error('provider_boom'); } }),
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    billingPolicy: managedPolicy(successfulAuthorityClient({ calls }))
  });

  await host.runOnce();
  const reconcile = calls.find((entry) => entry.kind === 'reconcile');
  assert.ok(reconcile);
  assert.equal(reconcile.input.outcome, 'failed');
  assert.equal(reconcile.input.actualTokens, 0);
  assert.equal(node.terminals[0].output, null);
  assert.equal(node.terminals[0].metadata.failed, true);
});

test('reconcile failure cannot emit a successful unpaid RESULT', async () => {
  const calls = [];
  const client = successfulAuthorityClient({
    calls,
    reconcile: async () => ({ ok: false, reason: 'accounting_reconcile_unavailable' })
  });
  const node = fakeNode([eventFor(need('reconcile-failed'))]);
  let executions = 0;
  const host = new TruynAdapterHost({
    node,
    adapter: createFunctionAdapter({
      capabilities: ['managed.test'],
      async execute() { executions += 1; return { output: 'UNPAID_MUST_NOT_ESCAPE', metadata: { totalTokens: 9 } }; }
    }),
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    billingPolicy: managedPolicy(client)
  });

  await host.runOnce();
  assert.equal(executions, 1);
  assert.equal(node.terminals[0].output, null);
  assert.equal(node.terminals[0].metadata.error, 'PROVIDER_ACCOUNTING_FAILED');
  assert.equal(node.terminals[0].metadata.billingReason, 'accounting_reconcile_unavailable');
});

test('cancellation after reserve reconciles as cancelled and does not emit a success terminal', async () => {
  const calls = [];
  const controller = new AbortController();
  const node = fakeNode();
  const host = new TruynAdapterHost({
    node,
    adapter: createFunctionAdapter({
      capabilities: ['managed.test'],
      async execute() {
        controller.abort(new Error('cancelled_by_requester'));
        throw controller.signal.reason;
      }
    }),
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    billingPolicy: managedPolicy(successfulAuthorityClient({ calls }))
  });
  const state = { controller, need: need('cancelled'), nextSequence: 0 };

  await host.executeNeed(state.need, state);
  const reconcile = calls.find((entry) => entry.kind === 'reconcile');
  assert.ok(reconcile);
  assert.equal(reconcile.input.outcome, 'cancelled');
  assert.equal(reconcile.input.reservationId, 'cancelled');
  assert.equal(node.terminals.length, 0);
});

test('durable accounted execution supports async reserve/reconcile and gates reconciliation before success', async () => {
  const order = [];
  const billingPolicy = {
    async authorize() {
      order.push('reserve');
      return {
        ok: true,
        reservedTokens: 30,
        async finalize({ outcome, actualTokens }) {
          order.push(`reconcile:${outcome}:${actualTokens}`);
          return { ok: true, status: 'committed' };
        }
      };
    }
  };
  const result = await executeWithDurableAccounting({
    billingPolicy,
    need: need('accounted-helper', 30),
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    estimatedTokens: 30,
    async execute() {
      order.push('execute');
      return { output: 'OK', metadata: { usage: { totalTokens: 11 } } };
    }
  });
  order.push('return');

  assert.equal(result.ok, true);
  assert.equal(result.actualTokens, 11);
  assert.deepEqual(order, ['reserve', 'execute', 'reconcile:completed:11', 'return']);
});
