import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectFirstP2P } from '../network/transport/p2p.js';

function record({ nodeId = 'truyn:node:peer-b', sequence, endpoint }) {
  return { nodeId, sequence, endpoints: [endpoint] };
}

function harness(initialRecord) {
  let current = initialRecord;
  const connects = [];
  const disconnects = [];
  const quic = {
    async connect(endpoint) {
      const client = { endpoint, closed: false, serial: connects.length + 1 };
      connects.push(client);
      return client;
    },
    async disconnect(client) {
      client.closed = true;
      disconnects.push(client);
    },
    async sendEnvelope(client) {
      if (client.closed) throw new Error('quic_client_closed');
      return { serial: client.serial, endpoint: client.endpoint };
    }
  };
  const discovery = {
    get(nodeId) { return nodeId === current.nodeId ? current : null; },
    async findNode(nodeId) { return nodeId === current.nodeId ? current : null; }
  };
  const router = new DirectFirstP2P({ quicTransport: quic, discovery, maxInFlight: 1, maxQueued: 1 });
  return {
    router,
    connects,
    disconnects,
    setRecord(next) { current = next; }
  };
}

test('newer signed peer record with a new endpoint invalidates the cached QUIC client', async () => {
  const h = harness(record({ sequence: 1, endpoint: 'quic://203.0.113.10:4433' }));

  const first = await h.router.send('truyn:node:peer-b', { id: 'one' }, { allowRelayFallback: false });
  assert.equal(first.transport, 'quic-direct');
  assert.deepEqual(first.result.endpoint, { host: '203.0.113.10', port: 4433 });
  assert.equal(h.connects.length, 1);

  h.setRecord(record({ sequence: 2, endpoint: 'quic://10.0.0.8:4433' }));
  const second = await h.router.send('truyn:node:peer-b', { id: 'two' }, { allowRelayFallback: false });

  assert.equal(second.transport, 'quic-direct');
  assert.deepEqual(second.result.endpoint, { host: '10.0.0.8', port: 4433 });
  assert.equal(h.connects.length, 2);
  assert.equal(h.disconnects.length, 1);
  assert.equal(h.disconnects[0].serial, 1);
});

test('newer peer-record sequence reconnects after peer restart even when endpoint is unchanged', async () => {
  const endpoint = 'quic://198.51.100.20:4433';
  const h = harness(record({ sequence: 7, endpoint }));

  const first = await h.router.send('truyn:node:peer-b', { id: 'before-restart' }, { allowRelayFallback: false });
  assert.equal(first.result.serial, 1);

  h.setRecord(record({ sequence: 8, endpoint }));
  const second = await h.router.send('truyn:node:peer-b', { id: 'after-restart' }, { allowRelayFallback: false });

  assert.equal(second.result.serial, 2);
  assert.equal(h.connects.length, 2);
  assert.equal(h.disconnects.length, 1);
});

test('missing target record recovers through live discovery control RPCs and sends the application envelope exactly once', async () => {
  const targetNodeId = 'truyn:node:target';
  const target = record({ nodeId: targetNodeId, sequence: 9, endpoint: 'quic://10.0.0.9:4433' });
  const liveA = record({ nodeId: 'truyn:node:live-a', sequence: 3, endpoint: 'quic://10.0.0.1:4433' });
  const liveB = record({ nodeId: 'truyn:node:live-b', sequence: 4, endpoint: 'quic://10.0.0.2:4433' });
  let currentTarget = null;
  let iterativeLookups = 0;
  let controlLookups = 0;
  let envelopeSends = 0;
  const ingested = [];

  const discovery = {
    k: 20,
    get(nodeId) { return nodeId === targetNodeId ? currentTarget : null; },
    snapshot() { return [liveA, liveB]; },
    ingest(next) {
      ingested.push(next.nodeId);
      if (next.nodeId === targetNodeId) currentTarget = next;
      return { accepted: true };
    },
    rpc: {
      async findNode(peer, nodeId) {
        controlLookups += 1;
        assert.equal(nodeId, targetNodeId);
        return peer.nodeId === liveA.nodeId ? { records: [target] } : { records: [] };
      },
      forget() {}
    },
    async findNode() {
      iterativeLookups += 1;
      return null;
    }
  };
  const quic = {
    async connect(endpoint) { return { endpoint }; },
    async disconnect() {},
    async sendEnvelope(client, envelope) {
      envelopeSends += 1;
      return { endpoint: client.endpoint, envelopeId: envelope.id };
    }
  };
  const router = new DirectFirstP2P({ quicTransport: quic, discovery });
  const envelope = { id: 'need-once' };

  const result = await router.send(targetNodeId, envelope, { allowRelayFallback: false });

  assert.equal(result.transport, 'quic-direct');
  assert.equal(result.result.envelopeId, 'need-once');
  assert.equal(controlLookups, 2, 'bounded live peers are queried only on the discovery control plane');
  assert.deepEqual(ingested, [targetNodeId]);
  assert.equal(iterativeLookups, 1, 'iterative Kademlia recovery is raced instead of started after live fanout');
  assert.equal(envelopeSends, 1, 'the application envelope must never be retried by discovery recovery');
});

test('target discovery returns on the first valid control response without waiting for a slow peer', async () => {
  const targetNodeId = 'truyn:node:target-early';
  const target = record({ nodeId: targetNodeId, sequence: 2, endpoint: 'quic://10.0.0.20:4433' });
  const liveA = record({ nodeId: 'truyn:node:live-slow', sequence: 1, endpoint: 'quic://10.0.0.1:4433' });
  const liveB = record({ nodeId: 'truyn:node:live-fast', sequence: 1, endpoint: 'quic://10.0.0.2:4433' });
  let currentTarget = null;
  let envelopeSends = 0;
  const never = new Promise(() => {});

  const discovery = {
    k: 20,
    get(nodeId) { return nodeId === targetNodeId ? currentTarget : null; },
    snapshot() { return [liveA, liveB]; },
    ingest(next) {
      if (next.nodeId === targetNodeId) currentTarget = next;
      return { accepted: true };
    },
    rpc: {
      findNode(peer) {
        return peer.nodeId === liveA.nodeId ? never : Promise.resolve({ records: [target] });
      },
      forget() {}
    },
    async findNode() { return null; }
  };
  const quic = {
    async connect(endpoint) { return { endpoint }; },
    async disconnect() {},
    async sendEnvelope() { envelopeSends += 1; return { ok: true }; }
  };
  const router = new DirectFirstP2P({ quicTransport: quic, discovery });

  const result = await Promise.race([
    router.send(targetNodeId, { id: 'early-success' }, { allowRelayFallback: false }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('discovery_waited_for_slowest_peer')), 200))
  ]);

  assert.equal(result.transport, 'quic-direct');
  assert.equal(envelopeSends, 1);
});

test('transient QUIC session establishment timeout retries only the connection and sends the envelope once', async () => {
  const targetNodeId = 'truyn:node:connect-retry';
  const target = record({ nodeId: targetNodeId, sequence: 5, endpoint: 'quic://10.0.0.30:4433' });
  let connectAttempts = 0;
  let envelopeSends = 0;
  const never = new Promise(() => {});
  const discovery = {
    get(nodeId) { return nodeId === targetNodeId ? target : null; },
    async findNode() { return target; }
  };
  const quic = {
    connect(endpoint) {
      connectAttempts += 1;
      if (connectAttempts === 1) return never;
      return Promise.resolve({ endpoint, serial: connectAttempts });
    },
    async disconnect() {},
    async sendEnvelope(client, envelope) {
      envelopeSends += 1;
      return { serial: client.serial, envelopeId: envelope.id };
    }
  };
  const router = new DirectFirstP2P({
    quicTransport: quic,
    discovery,
    directConnectTimeoutMs: 20,
    directConnectAttempts: 2
  });

  const result = await router.send(targetNodeId, { id: 'application-once' }, { allowRelayFallback: false });

  assert.equal(result.transport, 'quic-direct');
  assert.equal(result.result.serial, 2);
  assert.equal(connectAttempts, 2);
  assert.equal(envelopeSends, 1, 'connection recovery must not duplicate the application envelope');
});
