import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectFirstP2P } from '../network/transport/p2p.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const NODE = 'truyn:node:restarted-target';
const record = (instanceId, sequence) => ({ nodeId: NODE, instanceId, sequence, endpoints: ['quic://10.0.0.9:4433'] });

// Fake QUIC: sendEnvelope stays pending until released; disconnect() cancels pending
// streams the way @matrixai/quic does (rejection with `null`).
function fakeQuic() {
  const state = { connects: [], sends: [], disconnected: [] };
  return {
    state,
    async connect(endpoint) {
      const client = { index: state.connects.length, endpoint, closed: false, pending: [] };
      state.connects.push(client);
      return client;
    },
    async disconnect(client) {
      client.closed = true;
      state.disconnected.push(client.index);
      for (const pending of client.pending.splice(0)) pending.reject(null);
    },
    sendEnvelope(client, envelope) {
      if (client.closed) return Promise.reject(new Error('authenticated QUIC session is required'));
      const gate = deferred();
      client.pending.push(gate);
      state.sends.push({ client: client.index, id: envelope.id, gate });
      return gate.promise;
    }
  };
}

test('generation change retires the pooled connection without cancelling the dispatched NEED', async () => {
  const quic = fakeQuic();
  let current = record('instance-A', 1);
  const discovery = { get: (id) => (id === NODE ? current : null), async findNode() { return current; } };
  const router = new DirectFirstP2P({ quicTransport: quic, discovery });

  const sent = router.send(NODE, { id: 'need-1' }, { allowRelayFallback: false });
  while (quic.state.sends.length === 0) await tick();

  current = record('instance-B', 2);
  await router.retire(NODE);
  assert.deepEqual(quic.state.disconnected, [], 'in-flight dispatch keeps its connection');
  assert.equal(router.connections.has(NODE), false, 'retired binding is never reused');

  quic.state.sends[0].gate.resolve({ ok: true });
  const result = await sent;
  assert.equal(result.transport, 'quic-direct');
  await tick();
  assert.deepEqual(quic.state.disconnected, [0], 'retired connection closes after the last dispatch settles');

  const next = router.send(NODE, { id: 'need-2' }, { allowRelayFallback: false });
  while (quic.state.sends.length === 1) await tick();
  assert.equal(quic.state.sends[1].client, 1, 'next NEED uses a new connection for generation B');
  quic.state.sends[1].gate.resolve({ ok: true });
  await next;
  assert.equal(quic.state.sends.length, 2, 'exactly one dispatch per NEED');
});

test('generation change between connect and dispatch re-resolves before anything is sent', async () => {
  const quic = fakeQuic();
  let current = record('instance-A', 1);
  const discovery = { get: (id) => (id === NODE ? current : null), async findNode() { return current; } };
  const router = new DirectFirstP2P({ quicTransport: quic, discovery });
  const originalConnect = quic.connect.bind(quic);
  let first = true;
  quic.connect = async (endpoint) => {
    const client = await originalConnect(endpoint);
    if (first) {
      first = false;
      // The new generation arrives right after the handshake completes.
      queueMicrotask(() => { current = record('instance-B', 2); void router.retire(NODE); });
    }
    return client;
  };
  const sent = router.send(NODE, { id: 'need-1' }, { allowRelayFallback: false });
  while (quic.state.sends.length === 0) await tick();
  assert.equal(quic.state.sends[0].client, 1, 'dispatch happens only on the generation-B connection');
  quic.state.sends[0].gate.resolve({ ok: true });
  assert.equal((await sent).transport, 'quic-direct');
  assert.equal(quic.state.sends.length, 1, 'no duplicate application dispatch');
});

test('explicit forget (fault/partition control) stays destructive and the failure is classified', async () => {
  const quic = fakeQuic();
  const current = record('instance-A', 1);
  const discovery = { get: (id) => (id === NODE ? current : null), async findNode() { return current; } };
  const router = new DirectFirstP2P({ quicTransport: quic, discovery });
  const sent = router.send(NODE, { id: 'need-1' }, { allowRelayFallback: false }).then(() => null, (error) => error);
  while (quic.state.sends.length === 0) await tick();
  await router.forget(NODE);
  const error = await sent;
  assert.ok(error instanceof Error, 'a null transport rejection is never surfaced as-is');
  assert.equal(error.code, 'TRUYN_P2P_DISPATCH_FAILED');
  assert.equal(error.phase, 'direct-envelope');
  assert.equal(error.causeClass, 'null');
  assert.equal(quic.state.sends.length, 1, 'no application retry after dispatch');
});
