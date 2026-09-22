import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DirectFirstP2P } from '../network/transport/p2p.js';
import { QuicDiscoveryRpc } from '../network/discovery/quic-rpc.js';

const peer = { nodeId: 'truyn:node:d500-timeout-peer', endpoints: ['quic://127.0.0.1:4433'], sequence: 1 };

test('direct P2P timeout aborts the underlying connect before relay fallback', async () => {
  let aborted = false;
  let relayCalls = 0;
  const quic = {
    connect(_endpoint, { signal } = {}) {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          aborted = true;
          reject(signal.reason || Object.assign(new Error('aborted'), { code: 'ETIMEDOUT' }));
        }, { once: true });
      });
    },
    async disconnect() {}
  };
  const discovery = { get: (id) => id === peer.nodeId ? peer : null };
  const router = new DirectFirstP2P({
    quicTransport: quic,
    discovery,
    relayFallback: async () => { relayCalls += 1; return { ok: true }; },
    directConnectTimeoutMs: 20,
    directConnectAttempts: 1,
    routeAttemptTimeoutMs: 100
  });
  const result = await router.send(peer.nodeId, { type: 'NEED' });
  assert.equal(result.transport, 'relay-fallback');
  assert.equal(relayCalls, 1);
  assert.equal(aborted, true);
});

test('DHT timeout evicts a stuck coalesced connect so the next operation reconnects', async () => {
  let firstResolve;
  let connectCalls = 0;
  const disconnects = [];
  const first = { id: 'first' };
  const second = { id: 'second' };
  const quic = {
    connect() {
      connectCalls += 1;
      if (connectCalls === 1) return new Promise((resolve) => { firstResolve = resolve; });
      return Promise.resolve(second);
    },
    async disconnect(client) { disconnects.push(client.id); },
    async requestControl() { return { pong: true }; }
  };
  const rpc = new QuicDiscoveryRpc({ quicTransport: quic, timeoutMs: 100 });
  await assert.rejects(rpc.ping(peer), (error) => error?.code === 'TRUYN_DHT_RPC_TIMEOUT');
  assert.equal(await rpc.ping(peer), true);
  assert.equal(connectCalls, 2);
  firstResolve(first);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(disconnects.includes('first'));
});

test('QUIC transport wires a bounded create timer and external abort signal into @matrixai/quic', async () => {
  const source = await readFile(new URL('../network/transport/quic.js', import.meta.url), 'utf8');
  assert.match(source, /createQUICClient\([\s\S]*timer:\s*effectiveTimeoutMs[\s\S]*signal/);
  assert.match(source, /ErrorQUICClientCreateTimeout/);
});
