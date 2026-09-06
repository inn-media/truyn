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
