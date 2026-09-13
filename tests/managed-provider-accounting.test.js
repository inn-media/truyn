import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { TruynAdapterHost, createFunctionAdapter } from '../adapters/sdk/index.js';

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

function injectedManagedPolicy({ calls = [], reconcile = null } = {}) {
  const committed = new Set();
  return {
    mode: 'prepaid',
    managed: true,
    async authorize(request, { estimatedTokens } = {}) {
      calls.push({ kind: 'reserve', request, estimatedTokens });
      if (committed.has(request.id)) return { ok: false, reason: 'reservation_already_committed' };
      return {
        ok: true,
        mode: 'prepaid',
        managed: true,
        accountingReservationId: request.id,
        reservedTokens: estimatedTokens,
        billingResponsibility: 'requester-prepaid',
        async finalize(input) {
          calls.push({ kind: 'reconcile', input });
          if (reconcile) return reconcile(input);
          if (input.outcome === 'completed') committed.add(request.id);
          return { ok: true, status: input.outcome === 'completed' ? 'committed' : 'released', accounted: input.outcome === 'completed' };
        }
      };
    }
  };
}

test('injected managed reserve denial happens before remote provider execution', async () => {
  let executions = 0;
  const node = fakeNode([eventFor(need('reserve-denied'))]);
  const policy = { mode: 'prepaid', managed: true, async authorize() { return { ok: false, reason: 'token_quota_exhausted' }; } };
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

test('injected managed success is reserve -> execute once -> reconcile -> terminal and committed request cannot replay', async () => {
  const calls = [];
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
    billingPolicy: injectedManagedPolicy({ calls })
  });
  await host.runOnce();
  calls.push({ kind: 'terminal' });
  assert.equal(executions, 1);
  assert.deepEqual(calls.map((entry) => entry.kind), ['reserve', 'execute', 'reconcile', 'terminal']);
  assert.equal(calls[2].input.outcome, 'completed');
  assert.equal(calls[2].input.actualTokens, 17);
  assert.equal(node.terminals[0].output, 'PAID_OK');
  assert.equal(node.terminals[0].metadata.billingAccountingStatus, 'committed');

  node.sessionToken = 'session';
  node.poll = async () => ({ events: [eventFor(request)] });
  await host.runOnce();
  assert.equal(executions, 1);
  assert.equal(node.terminals[1].output, null);
  assert.equal(node.terminals[1].metadata.billingReason, 'reservation_already_committed');
});

test('provider failure releases injected managed reservation', async () => {
  const calls = [];
  const node = fakeNode([eventFor(need('provider-failed'))]);
  const host = new TruynAdapterHost({
    node,
    adapter: createFunctionAdapter({ capabilities: ['managed.test'], async execute() { throw new Error('provider_boom'); } }),
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    billingPolicy: injectedManagedPolicy({ calls })
  });
  await host.runOnce();
  const reconcile = calls.find((entry) => entry.kind === 'reconcile');
  assert.ok(reconcile);
  assert.equal(reconcile.input.outcome, 'failed');
  assert.equal(reconcile.input.actualTokens, 0);
  assert.equal(node.terminals[0].metadata.failed, true);
});

test('reconcile failure cannot emit a successful unpaid RESULT', async () => {
  const calls = [];
  const node = fakeNode([eventFor(need('reconcile-failed'))]);
  let executions = 0;
  const host = new TruynAdapterHost({
    node,
    adapter: createFunctionAdapter({ capabilities: ['managed.test'], async execute() { executions += 1; return { output: 'UNPAID_MUST_NOT_ESCAPE', metadata: { totalTokens: 9 } }; } }),
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    billingPolicy: injectedManagedPolicy({ calls, reconcile: async () => ({ ok: false, reason: 'accounting_reconcile_unavailable' }) })
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
    billingPolicy: injectedManagedPolicy({ calls })
  });
  const state = { controller, need: need('cancelled'), nextSequence: 0 };
  await host.executeNeed(state.need, state);
  const reconcile = calls.find((entry) => entry.kind === 'reconcile');
  assert.ok(reconcile);
  assert.equal(reconcile.input.outcome, 'cancelled');
  assert.equal(node.terminals.length, 0);
});
