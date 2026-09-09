import test from 'node:test';
import assert from 'node:assert/strict';
import { A2aTaskStore } from '../adapters/a2a/task-store.js';
import { A2A_TASK_STATES } from '../adapters/a2a/mapping.js';

function message(id) {
  return {
    messageId: id,
    role: 'ROLE_USER',
    parts: [{ text: 'ordering', mediaType: 'text/plain' }]
  };
}

function startedTask(store, suffix) {
  const task = store.create({
    ownerKey: 'owner',
    message: message(`p3-a1-ordering-${suffix}`),
    skill: { id: 'stream-ordering', capability: 'p3.a1.stream.ordering' }
  });
  store.start(task.id, {
    truynRequestId: `need-${suffix}`,
    providerNodeId: 'provider-1'
  });
  return task;
}

function partial(task, sequence, delta) {
  return {
    kind: 'PARTIAL',
    requestId: task.truynRequestId,
    from: 'provider-1',
    verification: { ok: true },
    payload: { sequence, delta }
  };
}

function artifactUpdates(task) {
  return task.streamEvents
    .map((event) => event.artifactUpdate)
    .filter(Boolean);
}

test('P3-A1 streaming emits PARTIAL updates monotonically and never materializes reorder/duplicate input', () => {
  const store = new A2aTaskStore();
  const ordered = startedTask(store, 'ordered');

  store.recordCompactEvent(partial(ordered, 0, 'A'));
  store.recordCompactEvent(partial(ordered, 1, 'B'));
  store.recordCompactEvent(partial(ordered, 2, 'C'));

  const accepted = artifactUpdates(ordered);
  const acceptedSequences = accepted.map((update) => update.metadata['io.truyn/sequence']);
  assert.deepEqual(acceptedSequences, [0, 1, 2]);
  assert.equal(new Set(acceptedSequences).size, acceptedSequences.length, 'accepted PARTIAL sequence must not contain duplicates');
  assert.deepEqual(accepted.map((update) => update.artifact.parts[0].text), ['A', 'B', 'C']);
  assert.deepEqual(accepted.map((update) => update.append), [false, true, true]);
  assert.equal(new Set(accepted.map((update) => update.artifact.artifactId)).size, 1, 'ordered PARTIAL updates must belong to one stream artifact');
  assert.equal(ordered.nextStreamSequence, 3);
  assert.equal(ordered.status.state, A2A_TASK_STATES.working);

  store.recordCompactEvent(partial(ordered, 2, 'duplicate-C'));
  assert.deepEqual(
    artifactUpdates(ordered).map((update) => update.metadata['io.truyn/sequence']),
    [0, 1, 2],
    'duplicate PARTIAL must not produce a second artifact update'
  );
  assert.equal(ordered.status.state, A2A_TASK_STATES.failed);
  assert.equal(ordered.streamEvents.at(-1).statusUpdate.status.message.metadata['io.truyn/errorCode'], 'A2A_PARTIAL_SEQUENCE_MISMATCH');

  const reordered = startedTask(store, 'reordered');
  store.recordCompactEvent(partial(reordered, 0, 'A'));
  store.recordCompactEvent(partial(reordered, 2, 'C-before-B'));

  assert.deepEqual(
    artifactUpdates(reordered).map((update) => update.metadata['io.truyn/sequence']),
    [0],
    'out-of-order PARTIAL must not be emitted'
  );
  assert.equal(reordered.status.state, A2A_TASK_STATES.failed);
  assert.equal(reordered.streamEvents.at(-1).statusUpdate.status.message.metadata['io.truyn/errorCode'], 'A2A_PARTIAL_SEQUENCE_MISMATCH');
});
