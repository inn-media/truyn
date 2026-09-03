import test from 'node:test';
import assert from 'node:assert/strict';
import { A2aTaskStore } from '../adapters/a2a/task-store.js';
import { A2A_TASK_STATES } from '../adapters/a2a/mapping.js';

test('C8 A2A task store rejects a verified RESULT from the wrong provider', () => {
  const store = new A2aTaskStore();
  const task = store.create({
    ownerKey: 'owner',
    message: { messageId: 'c8-wrong-provider', role: 'ROLE_USER', parts: [{ text: 'x' }] },
    skill: { id: 's', capability: 'c8.capability' }
  });
  store.start(task.id, { truynRequestId: 'request-c8', providerNodeId: 'provider-good' });

  const rejected = store.completeFromTruynEvent({
    kind: 'RESULT',
    verification: { ok: true },
    trust: { score: 1 },
    envelope: {
      from: 'provider-attacker',
      payload: { requestId: 'request-c8', output: 'spoofed', metadata: {} }
    }
  });

  assert.equal(rejected, null);
  assert.equal(store.snapshot(task).status.state, A2A_TASK_STATES.working);
  assert.equal(store.snapshot(task).artifacts, undefined);
  assert.equal(task.providerNodeId, 'provider-good');

  const accepted = store.completeFromTruynEvent({
    kind: 'RESULT',
    verification: { ok: true },
    trust: { score: 1 },
    envelope: {
      from: 'provider-good',
      payload: { requestId: 'request-c8', output: 'ok', metadata: {} }
    }
  });

  assert.equal(accepted.status.state, A2A_TASK_STATES.completed);
  assert.equal(store.snapshot(task).status.state, A2A_TASK_STATES.completed);
});
