import test from 'node:test';
import assert from 'node:assert/strict';
import { revokeTarget } from '../node/revoke.js';

test('explicit revoke API validates namespace before touching the network', async () => {
  const node = { requireSession() {}, envelope() { throw new Error('must_not_sign'); }, authHeaders() { return {}; }, relayUrl: 'http://127.0.0.1:1' };
  await assert.rejects(() => revokeTarget(node, 'x', { targetKind: 'auto' }), /targetKind must be need or offer/);
});
