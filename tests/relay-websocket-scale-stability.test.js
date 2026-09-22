// S-Series diagnostic: local-only, zero paid/provider calls; preserve all close telemetry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { TruynAdapterHost, createFunctionAdapter } from '../adapters/sdk/index.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function observe(node, label, events) {
  const socket = node.fastSocket;
  const startedAt = Date.now();
  socket.on('ping', () => events.push({ label, type: 'ping', atMs: Date.now() - startedAt }));
  socket.on('pong', () => events.push({ label, type: 'pong', atMs: Date.now() - startedAt }));
  socket.on('error', (error) => events.push({ label, type: 'error', message: error.message, atMs: Date.now() - startedAt }));
  socket.on('close', (code, reason) => events.push({ label, type: 'close', code, reason: reason.toString(), atMs: Date.now() - startedAt, readyState: socket.readyState, bufferedAmount: socket.bufferedAmount }));
}

test('50 fast sockets remain healthy across at least three relay heartbeat cycles', { timeout: 50_000 }, async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, exposeDiagnostics: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(async () => relay.close());
  const nodes = Array.from({ length: 50 }, () => new TruynNode({ relayUrl }));
  const events = [];
  await Promise.all(nodes.map((node, i) => node.register({ name: `ws-scale-${i + 1}` })));
  await Promise.all(nodes.map((node) => node.ensureFastSocket()));
  nodes.forEach((node, i) => observe(node, `node-${i + 1}`, events));
  await sleep(35_000);
  const closes = events.filter((event) => event.type === 'close');
  const relaySockets = relay.state.providerSockets.size;
  console.log('WS_SCALE_TELEMETRY=' + JSON.stringify({ sockets: nodes.length, relaySockets, closes, eventCount: events.length }));
  assert.equal(closes.length, 0, JSON.stringify(closes));
  assert.equal(relaySockets, 50);
  for (const node of nodes) node.closeFastSocket();
});

test('queued oversized event deterministically identifies socket_backpressure close branch', { timeout: 10_000 }, async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, exposeDiagnostics: true, maxSocketBufferedBytes: 1 });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(async () => relay.close());
  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register({ name: 'backpressure-provider' });
  await requester.register({ name: 'backpressure-requester' });
  await provider.offer('diagnostic.backpressure');
  const need = await requester.compactNeed('diagnostic.backpressure', { payload: 'x'.repeat(128) }, {}, { waitMs: 0 });
  assert.ok(need.needId);
  const closes = [];
  await provider.ensureFastSocket();
  provider.fastSocket.on('close', (code, reason) => closes.push({ code, reason: reason.toString(), bufferedAmount: provider.fastSocket?.bufferedAmount ?? null }));
  await sleep(250);
  console.log('WS_BACKPRESSURE_TELEMETRY=' + JSON.stringify({ closes, relaySockets: relay.state.providerSockets.size }));
  assert.deepEqual(closes.map(({ code, reason }) => ({ code, reason })), [{ code: 1013, reason: 'socket_backpressure' }]);
  requester.closeFastSocket();
});

test('provider socket reconnect does not duplicate an already dequeued execution', { timeout: 15_000 }, async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, exposeDiagnostics: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(async () => relay.close());
  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  let executions = 0;
  let executionStarted;
  const started = new Promise((resolve) => { executionStarted = resolve; });
  const adapter = createFunctionAdapter({
    name: 'reconnect-exactly-once',
    capabilities: ['diagnostic.reconnect-once'],
    execute: async () => {
      executions += 1;
      executionStarted();
      await sleep(150);
      return { output: 'done', metadata: { executions } };
    }
  });
  const host = new TruynAdapterHost({ node: provider, adapter, fastPath: true, socketPath: true, socketReconnectDelayMs: 10 });
  await requester.register({ name: 'reconnect-requester' });
  await host.start();
  t.after(async () => host.stop());
  const matched = await requester.compactNeed('diagnostic.reconnect-once', { value: 1 }, {}, { waitMs: 0 });
  await started;
  const firstSocket = provider.fastSocket;
  const closeEvents = [];
  firstSocket.on('close', (code, reason) => closeEvents.push({ code, reason: reason.toString() }));
  firstSocket.close(1013, 'diagnostic_backpressure');
  await sleep(500);
  const result = await requester.pollCompact({ waitMs: 1000 });
  console.log('WS_RECONNECT_TELEMETRY=' + JSON.stringify({ executions, closeEvents, resultEvents: result.events.map((event) => ({ kind: event.kind, id: event.frame?.i })) }));
  assert.equal(executions, 1, 'accepted work must execute exactly once across socket reconnect');
  assert.equal(result.events.filter((event) => event.kind === 'RESULT' && event.frame?.i === matched.needId).length, 1);
  assert.equal(host.running, true, 'host must remain running after recoverable socket close');
});
