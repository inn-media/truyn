import test from 'node:test';
import assert from 'node:assert/strict';
import { TruynNetworkNode } from '../network/runtime.js';

const need = TruynNetworkNode.prototype.need;

function fixture({ live = null, resolved = null } = {}) {
  const calls = { get: 0, find: 0, envelope: 0, send: 0 };
  const node = {
    discovery: {
      get(nodeId) {
        calls.get += 1;
        assert.equal(nodeId, 'target');
        return live;
      }
    },
    async findPeer(nodeId) {
      calls.find += 1;
      assert.equal(nodeId, 'target');
      return resolved;
    },
    envelope(type, payload, meta) {
      calls.envelope += 1;
      return { type, payload, meta };
    },
    async send(nodeId, envelope, options) {
      calls.send += 1;
      return { nodeId, envelope, options };
    }
  };
  return { node, calls };
}

test('NEED sends exactly once without lookup when a live signed peer record is already cached', async () => {
  const { node, calls } = fixture({ live: { nodeId: 'target' } });
  const result = await need.call(node, 'target', 'testnet.echo', { n: 1 }, {}, { allowRelayFallback: false });
  assert.equal(result.nodeId, 'target');
  assert.deepEqual(calls, { get: 1, find: 0, envelope: 1, send: 1 });
});

test('D-500 regression: NEED resolves stale or missing peer state before the only application send', async () => {
  const { node, calls } = fixture({ live: null, resolved: { nodeId: 'target' } });
  const result = await need.call(node, 'target', 'testnet.echo', { n: 2 });
  assert.equal(result.nodeId, 'target');
  assert.deepEqual(calls, { get: 1, find: 1, envelope: 1, send: 1 });
});

test('NEED fails closed before creating or sending an application envelope when resolution fails', async () => {
  const { node, calls } = fixture({ live: null, resolved: null });
  await assert.rejects(
    need.call(node, 'target', 'testnet.echo', { n: 3 }),
    (error) => error?.code === 'TRUYN_PEER_NOT_FOUND'
  );
  assert.deepEqual(calls, { get: 1, find: 1, envelope: 0, send: 0 });
});
