import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDurableJsonStore } from '../core/security/durable-json-store.js';
import { TruynAdapterHost, createFunctionAdapter } from '../adapters/sdk/index.js';

function tempDir(t, prefix = 'truyn-authority-correctness-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

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

test('provider host finalizes injected billing on success and failure', async () => {
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

test('provider stop releases an injected in-flight reservation as cancelled', async () => {
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
