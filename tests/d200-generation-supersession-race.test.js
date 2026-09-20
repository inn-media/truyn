import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectFirstP2P } from '../network/transport/p2p.js';
import { QuicDiscoveryRpc } from '../network/discovery/quic-rpc.js';

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function peer(instanceId, sequence = 1) {
  return { nodeId: 'truyn:node:restart-target', instanceId, sequence, endpoints: ['quic://10.0.0.9:4433'] };
}

test('D-200 race: old P2P generation completing after new generation cannot destroy the new client', async () => {
  let current = peer('instance-A', 1);
  const gates = [deferred(), deferred()];
  const connects = [];
  const disconnected = [];
  const sends = [];
  const quic = {
    async connect(endpoint) {
      const index = connects.length;
      const client = { index, endpoint, closed: false };
      connects.push(client);
      await gates[index].promise;
      return client;
    },
    async disconnect(client) { client.closed = true; disconnected.push(client.index); },
    async sendEnvelope(client, envelope) {
      assert.equal(client.closed, false, 'new generation client must remain alive');
      sends.push({ client: client.index, envelope: envelope.id });
      return { client: client.index };
    }
  };
  const discovery = {
    get(nodeId) { return nodeId === current.nodeId ? current : null; },
    async findNode() { return current; }
  };
  const router = new DirectFirstP2P({ quicTransport: quic, discovery, supersededRetries: 2 });

  const oldSend = router.send(current.nodeId, { id: 'old-request' }, { allowRelayFallback: false });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(connects.length, 1);

  current = peer('instance-B', 2);
  const newSend = router.send(current.nodeId, { id: 'new-request' }, { allowRelayFallback: false });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(connects.length, 2, 'new generation starts its own connection');

  gates[0].resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(disconnected, [0], 'only the superseded A client may be disconnected');
  assert.equal(connects[1].closed, false, 'B must survive A completion');

  gates[1].resolve();
  const [oldResult, newResult] = await Promise.all([oldSend, newSend]);
  assert.equal(oldResult.transport, 'quic-direct');
  assert.equal(newResult.transport, 'quic-direct');
  assert.ok(sends.every((row) => row.client === 1), 'both requests converge onto generation B');
  assert.equal(sends.length, 2, 'each application envelope is dispatched exactly once');
  assert.equal(connects[1].closed, false);
});

test('D-200 race: old discovery generation adopts newer pending client instead of cancelling it', async () => {
  const gates = [deferred(), deferred()];
  const connects = [];
  const disconnected = [];
  const quic = {
    async connect(endpoint) {
      const index = connects.length;
      const client = { index, endpoint, closed: false };
      connects.push(client);
      await gates[index].promise;
      return client;
    },
    async disconnect(client) { client.closed = true; disconnected.push(client.index); }
  };
  const rpc = new QuicDiscoveryRpc({ quicTransport: quic, supersededRetries: 2 });
  const a = peer('instance-A', 1);
  const b = peer('instance-B', 2);

  const oldClientP = rpc.client(a);
  await new Promise((resolve) => setImmediate(resolve));
  const newClientP = rpc.client(b);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(connects.length, 2);

  gates[0].resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(disconnected, [0]);
  assert.equal(connects[1].closed, false, 'newer discovery connection must survive old completion');

  gates[1].resolve();
  const [oldClient, newClient] = await Promise.all([oldClientP, newClientP]);
  assert.equal(oldClient, newClient, 'superseded caller must converge on the new generation client');
  assert.equal(newClient.index, 1);
  assert.equal(newClient.closed, false);
});

test('D-200 concurrency: one failed control stream retires cache without killing a sibling stream', async () => {
  const firstGate = deferred();
  const secondGate = deferred();
  const connects = [];
  const disconnected = [];
  let controlCalls = 0;
  const quic = {
    async connect(endpoint) {
      const client = { index: connects.length, endpoint, closed: false };
      connects.push(client);
      return client;
    },
    async disconnect(client) {
      client.closed = true;
      disconnected.push(client.index);
    },
    async requestControl(client) {
      const call = controlCalls++;
      if (call === 0) {
        await firstGate.promise;
        const error = new Error('stream_reset');
        error.code = 'ECONNRESET';
        throw error;
      }
      if (call === 1) {
        await secondGate.promise;
        assert.equal(client.closed, false, 'sibling stream client must remain alive');
        return { pong: true };
      }
      assert.equal(client.closed, false);
      return { pong: true };
    }
  };
  const rpc = new QuicDiscoveryRpc({ quicTransport: quic, timeoutMs: 2_000 });
  const target = peer('instance-shared', 7);

  const first = rpc.ping(target);
  const second = rpc.ping(target);
  for (let i = 0; i < 20 && controlCalls < 2; i += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controlCalls, 2, 'both RPC streams must enter the shared client');
  assert.equal(connects.length, 1, 'concurrent streams must share one authenticated client');

  firstGate.resolve();
  await assert.rejects(first, /stream_reset/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(disconnected, [], 'retired client must stay alive while sibling stream still holds a lease');
  assert.equal(connects[0].closed, false);

  secondGate.resolve();
  assert.equal(await second, true, 'sibling RPC must complete successfully');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(disconnected, [0], 'retired client is torn down after the last sibling releases it');

  assert.equal(await rpc.ping(target), true);
  assert.equal(connects.length, 2, 'future RPC must establish a fresh client after retirement');
  assert.equal(connects[1].closed, false);
});
