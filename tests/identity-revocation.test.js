import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IDENTITY_REVOCATION_SCHEMA,
  assertIdentityNotRevoked,
  createIdentityRevocation,
  parseIdentityRevocation,
  serializeIdentityRevocation
} from '../core/identity/revocation.js';

test('replaced identity gets deterministic key-free revocation state', () => {
  const revokedAt = new Date('2026-09-28T04:00:00.000Z');
  const record = createIdentityRevocation({
    explicit: true,
    oldNodeId: 'node-old',
    newNodeId: 'node-new'
  }, { now: () => revokedAt });

  assert.deepEqual(record, {
    schema: IDENTITY_REVOCATION_SCHEMA,
    status: 'revoked',
    revokedNodeId: 'node-old',
    replacementNodeId: 'node-new',
    revokedAt: revokedAt.toISOString(),
    reason: 'identity-replaced'
  });
  const serialized = serializeIdentityRevocation(record);
  assert.deepEqual(parseIdentityRevocation(serialized), record);
  assert.equal(serialized.includes('PRIVATE KEY'), false);
});

test('revoked identity cannot silently resume normal use', () => {
  const record = createIdentityRevocation({ explicit: true, oldNodeId: 'node-old', newNodeId: 'node-new' });
  assert.throws(
    () => assertIdentityNotRevoked('node-old', [record]),
    (error) => error?.code === 'TRUYN_IDENTITY_REVOKED' && /node-new/.test(error.message)
  );
  assert.equal(assertIdentityNotRevoked('node-new', [record]), true);
});

test('revocation fails closed without a valid explicit replacement boundary', () => {
  assert.throws(() => createIdentityRevocation(null), /explicit rotation audit/);
  assert.throws(() => createIdentityRevocation({ explicit: false, oldNodeId: 'a', newNodeId: 'b' }), /explicit rotation audit/);
  assert.throws(() => createIdentityRevocation({ explicit: true, oldNodeId: 'same', newNodeId: 'same' }), /distinct old\/new/);
  assert.throws(() => parseIdentityRevocation({ schema: IDENTITY_REVOCATION_SCHEMA, status: 'active' }), /Invalid identity revocation record/);
});
