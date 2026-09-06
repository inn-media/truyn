import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createPeerRecord } from '../network/discovery/peer-discovery.js';
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
  const router = new DirectFirstP2P({ quicTransport: quic, discovery, maxInFlight: 64, maxQueued: 64, ...routerOptions });
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
  assert.equal(h.connects.length, 1);

  h.setRecord(record({ sequence: 2, endpoint: 'quic://10.0.0.8:4433' }));
  const second = await h.router.send('truyn:node:peer-b', { id: 'two' }, { allowRelayFallback: false });
  assert.equal(second.transport, 'quic-direct');
  assert.equal(h.connects.length, 2);
  assert.equal(h.disconnects.length, 1);
  assert.equal(h.disconnects[0].serial, 1);
});

test('newer peer-record sequence reconnects after peer restart even when endpoint is unchanged', async () => {
  const endpoint = 'quic://198.51.100.20:4433';
  const h = harness(record({ sequence: 7, endpoint }));
  assert.equal((await h.router.send('truyn:node:peer-b', { id: 'before' }, { allowRelayFallback: false })).result.serial, 1);
  h.setRecord(record({ sequence: 8, endpoint }));
  assert.equal((await h.router.send('truyn:node:peer-b', { id: 'after' }, { allowRelayFallback: false })).result.serial, 2);
  assert.equal(h.connects.length, 2);
  assert.equal(h.disconnects.length, 1);
});

test('idle cached direct connection is refreshed before the first application envelope', async () => {
  const targetNodeId = 'truyn:node:peer-b';
  const h = harness(record({ sequence: 3, endpoint: 'quic://198.51.100.21:4433' }), { directConnectionReuseIdleMs: 20 });
  assert.equal((await h.router.send(targetNodeId, { id: 'warm' }, { allowRelayFallback: false })).result.serial, 1);
  h.router.connections.get(targetNodeId).lastUsedAt = Date.now() - 21;
  assert.equal((await h.router.send(targetNodeId, { id: 'after-idle' }, { allowRelayFallback: false })).result.serial, 2);
  assert.equal(h.disconnects[0].serial, 1);
});

test('expired signed target record is control-plane hint only and must refresh to a fresh signed record before NEED', async () => {
  const targetIdentity = createIdentity();
  const stale = createPeerRecord({
    identity: targetIdentity,
    endpoints: ['quic://10.0.0.40:4433'],
    sequence: 7,
    issuedAt: '2026-01-01T00:00:00.000Z',
    ttlMs: 1_000
  });
  const fresh = createPeerRecord({
    identity: targetIdentity,
    endpoints: ['quic://10.0.0.41:4433'],
    sequence: 8,
    ttlMs: 300_000
  });
  let currentTarget = null;
  let controlLookups = 0;
  let canonicalLookups = 0;
  let envelopeSends = 0;
  const discovery = {
    get(nodeId) { return nodeId === targetIdentity.nodeId ? currentTarget : null; },
    durableSnapshot() { return [stale]; },
    ingest(next) {
      if (next.nodeId === targetIdentity.nodeId) currentTarget = next;
      return { accepted: true };
    },
    rpc: {
      withDeadline(_deadlineAt, operation) { return operation(); },
      async findNode(peer, targetNodeId) {
        controlLookups += 1;
        assert.equal(peer.recordId, stale.recordId, 'only the authenticated expired record may seed the control endpoint');
        assert.equal(targetNodeId, targetIdentity.nodeId);
        return { records: [fresh] };
      },
      forget() {}
    },
    async findNode() { canonicalLookups += 1; return null; }
  };
  const quic = {
    async connect(endpoint) { return { endpoint }; },
    async disconnect() {},
    async sendEnvelope(client, envelope) {
      envelopeSends += 1;
      assert.equal(currentTarget?.recordId, fresh.recordId, 'fresh signed target authority must exist before application dispatch');
      assert.deepEqual(client.endpoint, { host: '10.0.0.41', port: 4433 });
      return { envelopeId: envelope.id };
    }
  };
  const router = new DirectFirstP2P({ quicTransport: quic, discovery });
  const result = await router.send(targetIdentity.nodeId, { id: 'need-once' }, { allowRelayFallback: false });
  assert.equal(result.transport, 'quic-direct');
  assert.equal(controlLookups, 1);
  assert.equal(canonicalLookups, 0, 'fresh exact-hint recovery finishes before canonical Kademlia fallback');
  assert.equal(envelopeSends, 1);
});

test('expired signed hint can never be used for an application envelope when refresh does not return a fresh record', async () => {
  const targetIdentity = createIdentity();
  const stale = createPeerRecord({
    identity: targetIdentity,
    endpoints: ['quic://10.0.0.42:4433'],
    sequence: 1,
    issuedAt: '2026-01-01T00:00:00.000Z',
    ttlMs: 1_000
  });
  let applicationSends = 0;
  const discovery = {
    get() { return null; },
    durableSnapshot() { return [stale]; },
    ingest() { return { accepted: true }; },
    rpc: {
      withDeadline(_deadlineAt, operation) { return operation(); },
      async findNode() { return { records: [] }; },
      forget() {}
    },
    async findNode() { return null; }
  };
  const router = new DirectFirstP2P({
    quicTransport: {
      async connect() { throw new Error('must_not_connect_application_to_stale_hint'); },
      async sendEnvelope() { applicationSends += 1; }
    },
    discovery
  });
  await assert.rejects(router.send(targetIdentity.nodeId, { id: 'never' }, { allowRelayFallback: false }), /peer_not_discovered/);
  assert.equal(applicationSends, 0);
});

test('20 concurrent missing-target requests coalesce to one canonical lookup and one QUIC handshake', async () => {
  const targetNodeId = 'truyn:node:coalesced-target';
  const target = record({ nodeId: targetNodeId, sequence: 5, endpoint: 'quic://10.0.0.55:4433' });
  let currentTarget = null;
  let findNodeCalls = 0;
  let connectCalls = 0;
  let envelopeSends = 0;
  let releaseLookup;
  const lookupGate = new Promise((resolve) => { releaseLookup = resolve; });
  let releaseConnect;
  const connectGate = new Promise((resolve) => { releaseConnect = resolve; });

  const discovery = {
    get(nodeId) { return nodeId === targetNodeId ? currentTarget : null; },
    durableSnapshot() { return []; },
    rpc: { withDeadline(_deadlineAt, operation) { return operation(); } },
    async findNode(nodeId) {
      assert.equal(nodeId, targetNodeId);
      findNodeCalls += 1;
      await lookupGate;
      currentTarget = target;
      return target;
    }
  };
  const quic = {
    async connect(endpoint) {
      connectCalls += 1;
      await connectGate;
      return { endpoint };
    },
    async disconnect() {},
    async sendEnvelope(_client, envelope) { envelopeSends += 1; return { id: envelope.id }; }
  };
  const router = new DirectFirstP2P({ quicTransport: quic, discovery, maxInFlight: 64, maxQueued: 64 });
  const requests = Array.from({ length: 20 }, (_, index) => router.send(targetNodeId, { id: `need-${index}` }, { allowRelayFallback: false }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(findNodeCalls, 1, 'one target has one in-flight canonical discovery recovery');
  releaseLookup();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(connectCalls, 1, 'one peer has one in-flight direct QUIC connect');
  releaseConnect();
  const results = await Promise.all(requests);
  assert.equal(results.length, 20);
  assert.equal(envelopeSends, 20, 'each distinct NEED is dispatched exactly once');
});

test('normal missing-target path does not call broad snapshot/closest fanout helpers', async () => {
  const targetNodeId = 'truyn:node:canonical-only';
  const target = record({ nodeId: targetNodeId, sequence: 1, endpoint: 'quic://10.0.0.70:4433' });
  let canonicalLookups = 0;
  const discovery = {
    get() { return null; },
    durableSnapshot() { return []; },
    snapshot() { throw new Error('broad_snapshot_must_not_run'); },
    closest() { throw new Error('broad_closest_must_not_run'); },
    rpc: { withDeadline(_deadlineAt, operation) { return operation(); } },
    async findNode() { canonicalLookups += 1; return target; }
  };
  const router = new DirectFirstP2P({
    quicTransport: {
      async connect(endpoint) { return { endpoint }; },
      async disconnect() {},
      async sendEnvelope() { return { ok: true }; }
    },
    discovery
  });
  assert.equal((await router.send(targetNodeId, { id: 'canonical' }, { allowRelayFallback: false })).transport, 'quic-direct');
  assert.equal(canonicalLookups, 1);
});

test('transient QUIC session establishment timeout retries only the connection and sends the envelope once', async () => {
  const targetNodeId = 'truyn:node:connect-retry';
  const target = record({ nodeId: targetNodeId, sequence: 5, endpoint: 'quic://10.0.0.30:4433' });
  let connectAttempts = 0;
  let envelopeSends = 0;
  const never = new Promise(() => {});
  const discovery = { get(nodeId) { return nodeId === targetNodeId ? target : null; }, async findNode() { return target; } };
  const quic = {
    connect(endpoint) {
      connectAttempts += 1;
      if (connectAttempts === 1) return never;
      return Promise.resolve({ endpoint, serial: connectAttempts });
    },
    async disconnect() {},
    async sendEnvelope(client, envelope) { envelopeSends += 1; return { serial: client.serial, envelopeId: envelope.id }; }
  };
  const router = new DirectFirstP2P({ quicTransport: quic, discovery, directConnectTimeoutMs: 20, directConnectAttempts: 2 });
  const result = await router.send(targetNodeId, { id: 'application-once' }, { allowRelayFallback: false });
  assert.equal(result.result.serial, 2);
  assert.equal(connectAttempts, 2);
  assert.equal(envelopeSends, 1);
});

test('direct application dispatch failure never falls back to a second relay application dispatch', async () => {
  const targetNodeId = 'truyn:node:ambiguous-direct';
  const target = record({ nodeId: targetNodeId, sequence: 1, endpoint: 'quic://10.0.0.80:4433' });
  let directSends = 0;
  let relaySends = 0;
  const router = new DirectFirstP2P({
    quicTransport: {
      async connect(endpoint) { return { endpoint }; },
      async disconnect() {},
      async sendEnvelope() { directSends += 1; throw new Error('ambiguous_after_dispatch'); }
    },
    discovery: { get(nodeId) { return nodeId === targetNodeId ? target : null; }, async findNode() { return target; } },
    relayFallback: async () => { relaySends += 1; return { ok: true }; }
  });
  await assert.rejects(router.send(targetNodeId, { id: 'only-once' }), /ambiguous_after_dispatch/);
  assert.equal(directSends, 1);
  assert.equal(relaySends, 0);
});

test('pre-dispatch direct connection failure may fall back, but relay still receives exactly one application envelope', async () => {
  const targetNodeId = 'truyn:node:relay-once';
  const target = record({ nodeId: targetNodeId, sequence: 1, endpoint: 'quic://10.0.0.81:4433' });
  let relaySends = 0;
  const router = new DirectFirstP2P({
    quicTransport: { async connect() { throw new Error('connect_failed'); }, async disconnect() {} },
    discovery: { get(nodeId) { return nodeId === targetNodeId ? target : null; }, async findNode() { return target; } },
    relayFallback: async (_peer, envelope) => { relaySends += 1; return { id: envelope.id }; },
    directConnectAttempts: 1
  });
  const result = await router.send(targetNodeId, { id: 'relay-only-once' });
  assert.equal(result.transport, 'relay-fallback');
  assert.equal(relaySends, 1);
});

test('route attempt has one deadline below the external 15 second baseline budget', async () => {
  const targetNodeId = 'truyn:node:deadline';
  const never = new Promise(() => {});
  const router = new DirectFirstP2P({
    quicTransport: { async connect() { throw new Error('must_not_connect'); } },
    discovery: {
      get() { return null; },
      durableSnapshot() { return []; },
      rpc: { withDeadline(_deadlineAt, operation) { return operation(); } },
      async findNode() { return never; }
    },
    discoveryRecoveryTimeoutMs: 1_000,
    routeAttemptTimeoutMs: 120
  });
  const startedAt = Date.now();
  await assert.rejects(router.send(targetNodeId, { id: 'deadline' }, { allowRelayFallback: false }), /peer_not_discovered/);
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed >= 80 && elapsed < 500, `route deadline must bound internal work, observed ${elapsed}ms`);
});
