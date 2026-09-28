import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { parseDurableIdentity, serializeDurableIdentity } from '../core/identity/storage.js';
import {
  IDENTITY_ROTATION_AUDIT_SCHEMA,
  IDENTITY_ROTATION_CONFIRMATION,
  rotateDurableIdentity
} from '../core/identity/rotation.js';

function durableFixture() {
  return serializeDurableIdentity(createIdentity(), { network: 'mainnet', profile: 'default' });
}

test('node identity rotation is impossible without explicit user confirmation', () => {
  const durable = durableFixture();
  const before = parseDurableIdentity(durable).identity.nodeId;
  assert.throws(() => rotateDurableIdentity(durable), /requires explicit confirmation/);
  assert.throws(() => rotateDurableIdentity(durable, { confirmation: 'yes' }), /requires explicit confirmation/);
  assert.equal(parseDurableIdentity(durable).identity.nodeId, before);
});

test('explicit rotation creates a distinct intended node ID and auditable boundary', () => {
  const durable = durableFixture();
  const before = parseDurableIdentity(durable);
  const rotatedAt = new Date('2026-09-28T02:00:00.000Z');
  const result = rotateDurableIdentity(durable, {
    confirmation: IDENTITY_ROTATION_CONFIRMATION,
    reason: 'operator requested rotation',
    now: () => rotatedAt
  });
  const after = parseDurableIdentity(result.serializedIdentity);

  assert.notEqual(after.identity.nodeId, before.identity.nodeId);
  assert.equal(after.network, before.network);
  assert.equal(after.profile, before.profile);
  assert.deepEqual(result.audit, {
    schema: IDENTITY_ROTATION_AUDIT_SCHEMA,
    oldNodeId: before.identity.nodeId,
    newNodeId: after.identity.nodeId,
    rotatedAt: rotatedAt.toISOString(),
    reason: 'operator requested rotation',
    explicit: true
  });
  assert.equal(JSON.stringify(result.audit).includes('PRIVATE KEY'), false);
});

test('rotation fails closed if replacement identity does not cross the node ID boundary', () => {
  const durable = durableFixture();
  const current = parseDurableIdentity(durable).identity;
  assert.throws(() => rotateDurableIdentity(durable, {
    confirmation: IDENTITY_ROTATION_CONFIRMATION,
    createNewIdentity: () => current
  }), /replacement nodeId must differ/);
});
