import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectFirstP2P } from '../network/transport/p2p.js';

function record({ nodeId, sequence = 1, endpoint }) {
  return { nodeId, sequence, recordId: `record:${nodeId}:${sequence}:${endpoint}`, endpoints: [endpoint] };
}

test('stale target hint is re-resolved on the control plane and its authenticated session is reused before first NEED', async () => {
  const sourceNodeId = 'truyn:node:source-stale-hint';
  const targetNodeId = 'truyn:node:target-stale-hint';
  const liveNodeId = 'truyn:node:live-stale-hint';
  const staleTarget = record({ nodeId: targetNodeId, sequence: 1, endpoint: 'quic://10.0.0.20:4433' });
  const freshTarget = record({ nodeId: targetNodeId, sequence: 2, endpoint: 'quic://10.0.0.21:4433' });
  const live = record({ nodeId: liveNodeId, sequence: 1, endpoint: 'quic://10.0.0.22:4433' });
  let currentTarget = null;
  let targetControlQueries = 0;
  let sharedClientRequests = 0;
  let rawConnects = 0;
  let envelopeSends = 0;
  let targetSessionReady = false;
  const targetClient = { kind: 'shared-target-session' };

  const discovery = {
    k: 20,
    identity: { nodeId: sourceNodeId },
    get(nodeId) { return nodeId === targetNodeId ? currentTarget : null; },
    snapshot() { return [live]; },
    closest() { return [staleTarget, live]; },
    ingest(next) {
      if (next.nodeId === targetNodeId) currentTarget = next;
      return { accepted: true };
    },
    async findNode() { return null; },
    rpc: {
      async findNode(peer, nodeId) {
        assert.equal(nodeId, targetNodeId);
        if (peer.nodeId === targetNodeId) {
          targetControlQueries += 1;
          targetSessionReady = true;
          currentTarget = freshTarget;
          return { records: [freshTarget] };
        }
        return { records: [] };
      },
      async client(peer) {
        sharedClientRequests += 1;
        assert.equal(peer.recordId, freshTarget.recordId);
        assert.equal(targetSessionReady, true, 'the target control session must be established before application dispatch');
        return targetClient;
      },
      forget() {}
    }
  };

  const quic = {
    async connect() { rawConnects += 1; throw new Error('unexpected_independent_application_connection'); },
    async disconnect() {},
    async sendEnvelope(client, envelope) {
      envelopeSends += 1;
      assert.equal(client, targetClient);
      return { envelopeId: envelope.id };
    }
  };

  const router = new DirectFirstP2P({
    quicTransport: quic,
    discovery,
    discoveryRecoveryTimeoutMs: 100,
    directConnectTimeoutMs: 20
  });

  const result = await router.send(targetNodeId, { id: 'stale-hint-need-once' }, { allowRelayFallback: false });

  assert.equal(result.transport, 'quic-direct');
  assert.equal(result.result.envelopeId, 'stale-hint-need-once');
  assert.equal(currentTarget.recordId, freshTarget.recordId);
  assert.equal(targetControlQueries, 1);
  assert.equal(sharedClientRequests, 1);
  assert.equal(rawConnects, 0, 'application routing must reuse the authenticated discovery session');
  assert.equal(envelopeSends, 1, 'control-plane recovery must not retry NEED');
});

test('valid peer record connect timeout performs one bounded control refresh instead of blind 3x5s same-binding reconnects', async () => {
  const sourceNodeId = 'truyn:node:source-valid-timeout';
  const targetNodeId = 'truyn:node:target-valid-timeout';
  const liveNodeId = 'truyn:node:live-valid-timeout';
  const target = record({ nodeId: targetNodeId, sequence: 7, endpoint: 'quic://10.0.0.30:4433' });
  const live = record({ nodeId: liveNodeId, sequence: 3, endpoint: 'quic://10.0.0.31:4433' });
  const never = new Promise(() => {});
  const targetClient = { kind: 'refreshed-shared-target-session' };
  let targetSessionReady = false;
  let sharedClientRequests = 0;
  let targetControlQueries = 0;
  let envelopeSends = 0;
  let relayCalls = 0;

  const discovery = {
    k: 20,
    identity: { nodeId: sourceNodeId },
    get(nodeId) { return nodeId === targetNodeId ? target : null; },
    snapshot() { return [target, live]; },
    closest() { return [target, live]; },
    ingest() { return { accepted: true }; },
    async findNode() { return target; },
    rpc: {
      client(peer) {
        assert.equal(peer.nodeId, targetNodeId);
        sharedClientRequests += 1;
        if (sharedClientRequests === 1) return never;
        assert.equal(targetSessionReady, true, 'retry is allowed only after target control reachability is proven');
        return Promise.resolve(targetClient);
      },
      async findNode(peer, nodeId) {
        assert.equal(nodeId, targetNodeId);
        if (peer.nodeId === targetNodeId) {
          targetControlQueries += 1;
          targetSessionReady = true;
          return { records: [target] };
        }
        return { records: [] };
      },
      forget(nodeId) {
        if (nodeId === targetNodeId) targetSessionReady = false;
      }
    }
  };

  const quic = {
    async connect() { throw new Error('raw_application_connect_must_not_be_used'); },
    async disconnect() {},
    async sendEnvelope(client, envelope) {
      envelopeSends += 1;
      assert.equal(client, targetClient);
      return { envelopeId: envelope.id };
    }
  };

  const router = new DirectFirstP2P({
    quicTransport: quic,
    discovery,
    relayFallback: async () => { relayCalls += 1; return { duplicate: true }; },
    discoveryRecoveryTimeoutMs: 100,
    directConnectTimeoutMs: 20
  });

  const started = Date.now();
  const result = await router.send(targetNodeId, { id: 'valid-timeout-need-once' });
  const elapsedMs = Date.now() - started;

  assert.equal(result.transport, 'quic-direct');
  assert.equal(result.result.envelopeId, 'valid-timeout-need-once');
  assert.equal(sharedClientRequests, 2, 'one failed pre-dispatch connect plus one post-refresh session reuse');
  assert.equal(targetControlQueries, 1, 'the same valid record is revalidated through one bounded target control exchange');
  assert.equal(envelopeSends, 1, 'the application envelope is dispatched exactly once');
  assert.equal(relayCalls, 0);
  assert.ok(elapsedMs < 100, `bounded recovery unexpectedly stalled for ${elapsedMs}ms`);
});

test('ambiguous failure after sendEnvelope never falls back by resending the application envelope', async () => {
  const sourceNodeId = 'truyn:node:source-ambiguous';
  const targetNodeId = 'truyn:node:target-ambiguous';
  const target = record({ nodeId: targetNodeId, sequence: 1, endpoint: 'quic://10.0.0.40:4433' });
  let envelopeSends = 0;
  let relayCalls = 0;

  const discovery = {
    identity: { nodeId: sourceNodeId },
    get(nodeId) { return nodeId === targetNodeId ? target : null; },
    rpc: {
      async client() { return { kind: 'shared-target-session' }; },
      forget() {}
    }
  };
  const quic = {
    async connect() { throw new Error('raw_application_connect_must_not_be_used'); },
    async disconnect() {},
    async sendEnvelope() {
      envelopeSends += 1;
      const error = new Error('response_path_lost_after_write');
      error.code = 'ETIMEDOUT';
      throw error;
    }
  };
  const router = new DirectFirstP2P({
    quicTransport: quic,
    discovery,
    relayFallback: async () => { relayCalls += 1; return { duplicate: true }; },
    directConnectTimeoutMs: 20
  });

  await assert.rejects(router.send(targetNodeId, { id: 'ambiguous-need-once' }), /response_path_lost_after_write/);
  assert.equal(envelopeSends, 1);
  assert.equal(relayCalls, 0, 'ambiguous direct delivery must never become a second application execution');
});
