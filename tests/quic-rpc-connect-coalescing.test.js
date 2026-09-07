import test from 'node:test';
import assert from 'node:assert/strict';
import { QuicDiscoveryRpc } from '../network/discovery/quic-rpc.js';

test('20 concurrent control queries to one peer create exactly one in-flight QUIC connect', async () => {
  const peer = {
    nodeId: 'truyn:node:control-peer',
    sequence: 3,
    endpoints: ['quic://10.0.0.90:4433']
  };
  let connectCalls = 0;
  let controlCalls = 0;
  let releaseConnect;
  const connectGate = new Promise((resolve) => { releaseConnect = resolve; });
  const quic = {
    async connect(endpoint) {
      connectCalls += 1;
      await connectGate;
      return { endpoint, serial: connectCalls };
    },
    async disconnect() {},
    async requestControl(_client, method, payload) {
      controlCalls += 1;
      assert.equal(method, 'dht.find-node');
      assert.equal(payload.targetNodeId, 'truyn:node:target');
      return { records: [] };
    }
  };
  const rpc = new QuicDiscoveryRpc({ quicTransport: quic, timeoutMs: 1_000 });
  const requests = Array.from({ length: 20 }, () => rpc.findNode(peer, 'truyn:node:target'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(connectCalls, 1);
  releaseConnect();
  const results = await Promise.all(requests);
  assert.equal(results.length, 20);
  assert.equal(controlCalls, 20);
  assert.equal(connectCalls, 1, 'connection establishment is coalesced even though control RPCs remain independent');
});

test('failure on an old control client cannot supersede an in-flight replacement connect', async () => {
  const peer = {
    nodeId: 'truyn:node:replacement-peer',
    sequence: 1,
    endpoints: ['quic://10.0.0.92:4433']
  };
  let connectCalls = 0;
  let releaseReplacement;
  const replacementGate = new Promise((resolve) => { releaseReplacement = resolve; });
  let rejectOldControl;
  const oldControl = new Promise((_, reject) => { rejectOldControl = reject; });
  const quic = {
    async connect(endpoint) {
      connectCalls += 1;
      const serial = connectCalls;
      if (serial === 2) await replacementGate;
      return { endpoint, serial };
    },
    async disconnect() {},
    async requestControl(client, method) {
      if (client.serial === 1 && method === 'dht.ping') return { pong: true };
      if (client.serial === 1 && method === 'dht.find-node') return oldControl;
      if (client.serial === 2 && method === 'dht.ping') return { pong: true };
      throw new Error(`unexpected_control:${client.serial}:${method}`);
    }
  };
  const rpc = new QuicDiscoveryRpc({ quicTransport: quic, timeoutMs: 1_000 });
  assert.equal(await rpc.ping(peer), true);

  const staleRequest = rpc.findNode(peer, 'truyn:node:target');
  await new Promise((resolve) => setImmediate(resolve));
  rpc.forget(peer.nodeId);

  const replacementRequest = rpc.ping(peer);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(connectCalls, 2, 'replacement connection must be in flight before the stale request fails');

  rejectOldControl(new Error('old_control_failed'));
  await assert.rejects(staleRequest, /old_control_failed/);
  releaseReplacement();
  assert.equal(await replacementRequest, true);
  assert.equal(connectCalls, 2, 'failure on the old client must not force a third connection');
});

test('deadline context reduces DHT RPC timeout to the remaining route budget', async () => {
  const peer = {
    nodeId: 'truyn:node:deadline-peer',
    sequence: 1,
    endpoints: ['quic://10.0.0.91:4433']
  };
  const never = new Promise(() => {});
  let disconnects = 0;
  const rpc = new QuicDiscoveryRpc({
    timeoutMs: 5_000,
    quicTransport: {
      async connect(endpoint) { return { endpoint }; },
      async requestControl() { return never; },
      async disconnect() { disconnects += 1; }
    }
  });
  const startedAt = Date.now();
  await assert.rejects(
    rpc.withDeadline(Date.now() + 80, () => rpc.findNode(peer, 'truyn:node:target')),
    (error) => error?.code === 'TRUYN_DHT_RPC_TIMEOUT'
  );
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed >= 50 && elapsed < 500, `remaining route budget must dominate the configured 5s RPC timeout, observed ${elapsed}ms`);
  assert.ok(disconnects >= 1, 'timed-out control session is invalidated');
});
