import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectFirstP2P } from '../network/transport/p2p.js';

function record({ nodeId = 'truyn:node:peer-b', sequence, endpoint }) {
  return { nodeId, sequence, endpoints: [endpoint] };
}

function harness(initialRecord, routerOptions = {}) {
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
  const router = new DirectFirstP2P({ quicTransport: quic, discovery, maxInFlight: 1, maxQueued: 1, ...routerOptions });
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

test('idle cached direct connection is refreshed before the first application envelope', async () => {
  const targetNodeId = 'truyn:node:peer-b';
  const h = harness(
    record({ sequence: 3, endpoint: 'quic://198.51.100.21:4433' }),
    { directConnectionReuseIdleMs: 20 }
  );

  const first = await h.router.send(targetNodeId, { id: 'warm' }, { allowRelayFallback: false });
  assert.equal(first.result.serial, 1);
  const cached = h.router.connections.get(targetNodeId);
  assert.ok(cached);
  cached.lastUsedAt = Date.now() - 21;

  const second = await h.router.send(targetNodeId, { id: 'first-after-idle' }, { allowRelayFallback: false });

  assert.equal(second.transport, 'quic-direct');
  assert.equal(second.result.serial, 2);
  assert.equal(h.connects.length, 2);
  assert.equal(h.disconnects.length, 1);
  assert.equal(h.disconnects[0].serial, 1, 'stale cached session is discarded before NEED dispatch');
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

test('missing target record retries a failed read-only control lookup on a fresh session before NEED dispatch', async () => {
  const targetNodeId = 'truyn:node:target-control-retry';
  const target = record({ nodeId: targetNodeId, sequence: 4, endpoint: 'quic://10.0.0.60:4433' });
  const live = record({ nodeId: 'truyn:node:live-control-retry', sequence: 2, endpoint: 'quic://10.0.0.61:4433' });
  let currentTarget = null;
  let controlAttempts = 0;
  let forgets = 0;
  let envelopeSends = 0;

  const discovery = {
    k: 20,
    get(nodeId) { return nodeId === targetNodeId ? currentTarget : null; },
    snapshot() { return [live]; },
    ingest(next) {
      if (next.nodeId === targetNodeId) currentTarget = next;
      return { accepted: true };
    },
    rpc: {
      async findNode(peer, nodeId) {
        assert.equal(peer.nodeId, live.nodeId);
        assert.equal(nodeId, targetNodeId);
        controlAttempts += 1;
        if (controlAttempts === 1) {
          const error = new Error('stale_discovery_session');
          error.code = 'ETIMEDOUT';
          throw error;
        }
        return { records: [target] };
      },
      forget(nodeId) {
        assert.equal(nodeId, live.nodeId);
        forgets += 1;
      }
    },
    async findNode() { return null; }
  };
  const quic = {
    async connect(endpoint) { return { endpoint }; },
    async disconnect() {},
    async sendEnvelope(client, envelope) {
      envelopeSends += 1;
      return { endpoint: client.endpoint, envelopeId: envelope.id };
    }
  };
  const router = new DirectFirstP2P({ quicTransport: quic, discovery, discoveryRecoveryTimeoutMs: 100 });

  const result = await router.send(targetNodeId, { id: 'need-after-control-retry' }, { allowRelayFallback: false });

  assert.equal(result.transport, 'quic-direct');
  assert.equal(controlAttempts, 2);
  assert.equal(forgets, 1, 'failed control session is invalidated before the bounded retry');
  assert.equal(envelopeSends, 1, 'read-only discovery retry must not duplicate the application envelope');
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

test('post-heal stale target routing hint is rehydrated before the first application envelope', async () => {
  const targetNodeId = 'truyn:node:post-heal-target';
  const staleTargetHint = record({ nodeId: targetNodeId, sequence: 7, endpoint: 'quic://10.0.0.40:4433' });
  const freshTarget = record({ nodeId: targetNodeId, sequence: 8, endpoint: 'quic://10.0.0.40:4433' });
  const liveSlow = record({ nodeId: 'truyn:node:post-heal-live', sequence: 3, endpoint: 'quic://10.0.0.41:4433' });
  const never = new Promise(() => {});
  let currentTarget = null;
  let envelopeSends = 0;
  const queried = [];

  const discovery = {
    k: 20,
    identity: { nodeId: 'truyn:node:source' },
    get(nodeId) { return nodeId === targetNodeId ? currentTarget : null; },
    snapshot() { return [liveSlow]; },
    closest() { return [staleTargetHint, liveSlow]; },
    ingest(next) {
      if (next.nodeId === targetNodeId) currentTarget = next;
      return { accepted: true };
    },
    rpc: {
      findNode(peer, nodeId) {
        queried.push(peer.nodeId);
        assert.equal(nodeId, targetNodeId);
        if (peer.nodeId === targetNodeId) return Promise.resolve({ records: [freshTarget] });
        return never;
      },
      forget() {}
    },
    findNode() { return never; }
  };
  const quic = {
    async connect(endpoint) { return { endpoint }; },
    async disconnect() {},
    async sendEnvelope(client, envelope) {
      assert.equal(currentTarget, freshTarget, 'fresh signed target record must exist before NEED dispatch');
      envelopeSends += 1;
      return { endpoint: client.endpoint, envelopeId: envelope.id };
    }
  };
  const router = new DirectFirstP2P({
    quicTransport: quic,
    discovery,
    discoveryRecoveryTimeoutMs: 100,
    discoveryQueryBudget: 4
  });

  const result = await Promise.race([
    router.send(targetNodeId, { id: 'post-heal-once' }, { allowRelayFallback: false }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('stale_target_hint_not_rehydrated')), 250))
  ]);

  assert.equal(result.transport, 'quic-direct');
  assert.equal(result.result.envelopeId, 'post-heal-once');
  assert.equal(queried[0], targetNodeId, 'the exact authenticated routing hint should be queried first');
  assert.equal(envelopeSends, 1, 'rehydration must not retry the application envelope');
});

test('target readiness recovery is bounded and never dispatches an envelope without a valid target record', async () => {
  const targetNodeId = 'truyn:node:missing-after-heal';
  const live = record({ nodeId: 'truyn:node:bounded-live', sequence: 1, endpoint: 'quic://10.0.0.50:4433' });
  const never = new Promise(() => {});
  let envelopeSends = 0;

  const discovery = {
    k: 20,
    identity: { nodeId: 'truyn:node:bounded-source' },
    get() { return null; },
    snapshot() { return [live]; },
    closest() { return [live]; },
    ingest() { return { accepted: true }; },
    rpc: {
      findNode() { return never; },
      forget() {}
    },
    findNode() { return never; }
  };
  const quic = {
    async connect(endpoint) { return { endpoint }; },
    async disconnect() {},
    async sendEnvelope() { envelopeSends += 1; return { ok: true }; }
  };
  const router = new DirectFirstP2P({
    quicTransport: quic,
    discovery,
    discoveryRecoveryTimeoutMs: 20,
    discoveryQueryBudget: 1
  });

  await assert.rejects(
    router.send(targetNodeId, { id: 'must-not-send' }, { allowRelayFallback: false }),
    /peer_not_discovered/
  );
  assert.equal(envelopeSends, 0);
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

test('third bounded connection attempt can recover while the application envelope is still sent once', async () => {
  const targetNodeId = 'truyn:node:connect-third-attempt';
  const target = record({ nodeId: targetNodeId, sequence: 1, endpoint: 'quic://10.0.0.70:4433' });
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
      if (connectAttempts <= 2) return never;
      return Promise.resolve({ endpoint, serial: connectAttempts });
    },
    async disconnect() {},
    async sendEnvelope(client, envelope) {
      envelopeSends += 1;
      return { serial: client.serial, envelopeId: envelope.id };
    }
  };
  const router = new DirectFirstP2P({ quicTransport: quic, discovery, directConnectTimeoutMs: 20 });

  const result = await router.send(targetNodeId, { id: 'third-attempt-once' }, { allowRelayFallback: false });

  assert.equal(result.transport, 'quic-direct');
  assert.equal(result.result.serial, 3);
  assert.equal(connectAttempts, 3);
  assert.equal(envelopeSends, 1, 'connection-only retries must never duplicate NEED');
});
