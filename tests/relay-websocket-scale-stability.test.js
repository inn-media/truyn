import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { TruynAdapterHost, createFunctionAdapter } from '../adapters/sdk/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function observe(node, label, events) {
  const socket = node.fastSocket;
  const startedAt = Date.now();
  socket.on('ping', () => events.push({ label, type: 'ping', atMs: Date.now() - startedAt, bufferedAmount: socket.bufferedAmount }));
  socket.on('pong', () => events.push({ label, type: 'pong', atMs: Date.now() - startedAt, bufferedAmount: socket.bufferedAmount }));
  socket.on('error', (error) => events.push({ label, type: 'error', message: error.message, atMs: Date.now() - startedAt }));
  socket.on('close', (code, reason) => events.push({ label, type: 'close', code, reason: reason.toString(), atMs: Date.now() - startedAt, readyState: socket.readyState, bufferedAmount: socket.bufferedAmount }));
}

async function closeRelayIfListening(relay) {
  if (relay?.server?.listening) await relay.close();
}

test('50 fast sockets remain healthy across at least three relay heartbeat cycles', { timeout: 50_000 }, async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, exposeDiagnostics: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(async () => closeRelayIfListening(relay));
  const nodes = Array.from({ length: 50 }, () => new TruynNode({ relayUrl }));
  const events = [];
  await Promise.all(nodes.map((node, i) => node.register({ name: `ws-scale-${i + 1}` })));
  await Promise.all(nodes.map((node) => node.ensureFastSocket()));
  nodes.forEach((node, i) => observe(node, `node-${i + 1}`, events));
  await sleep(35_000);
  const closes = events.filter((event) => event.type === 'close');
  const relaySockets = relay.state.providerSockets.size;
  console.log('WS_SCALE_TELEMETRY=' + JSON.stringify({ sockets: nodes.length, relaySockets, closes, heartbeatEvents: events.filter((x) => x.type === 'ping' || x.type === 'pong').length }));
  assert.equal(closes.length, 0, JSON.stringify(closes));
  assert.equal(relaySockets, 50);
  for (const node of nodes) node.closeFastSocket();
});

test('queued event identifies socket_backpressure close branch', { timeout: 10_000 }, async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, exposeDiagnostics: true, maxSocketBufferedBytes: 1 });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(async () => closeRelayIfListening(relay));
  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register({ name: 'backpressure-provider' });
  await requester.register({ name: 'backpressure-requester' });
  await provider.offer('diagnostic.backpressure');
  const need = await requester.compactNeed('diagnostic.backpressure', { payload: 'x'.repeat(128) }, {}, { waitMs: 0 });
  assert.ok(need.needId);
  const closes = [];
  await provider.ensureFastSocket();
  provider.fastSocket.on('close', (code, reason) => closes.push({ code, reason: reason.toString() }));
  await sleep(250);
  console.log('WS_BACKPRESSURE_TELEMETRY=' + JSON.stringify({ closes, relaySockets: relay.state.providerSockets.size }));
  assert.deepEqual(closes, [{ code: 1013, reason: 'socket_backpressure' }]);
});

test('1013 socket_backpressure reconnect reconciles with zero duplicate provider execution', { timeout: 15_000 }, async (t) => {
  const relay = createRelay({ localDevelopmentMode: true, exposeDiagnostics: true });
  const relayUrl = await relay.listen({ port: 0 });
  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  let providerExecutions = 0;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const adapter = createFunctionAdapter({
    name: 'reconnect-exactly-once',
    capabilities: ['diagnostic.reconnect-once'],
    execute: async () => {
      providerExecutions += 1;
      markStarted();
      await sleep(150);
      return { output: 'done', metadata: { providerExecutions } };
    }
  });
  const host = new TruynAdapterHost({
    node: provider,
    adapter,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    fastPath: true,
    socketPath: true,
    socketReconnectDelayMs: 10
  });
  await requester.register({ name: 'reconnect-requester' });
  await host.start();
  t.after(async () => {
    provider.closeFastSocket();
    requester.closeFastSocket();
    await host.stop();
    await closeRelayIfListening(relay);
  });
  const matched = await requester.compactNeed('diagnostic.reconnect-once', { value: 1 }, {}, { waitMs: 0 });
  await started;
  const firstSocket = provider.fastSocket;
  const closes = [];
  firstSocket.on('close', (code, reason) => closes.push({ code, reason: reason.toString() }));
  firstSocket.close(1013, 'socket_backpressure');
  await sleep(500);
  const reconnectedSocket = provider.fastSocket;
  const result = await requester.pollCompact({ waitMs: 1000 });
  const matchingResults = result.events.filter((event) => event.kind === 'RESULT' && event.frame?.i === matched.needId);
  await sleep(250);
  const status = await requester.compactRequestStatus(matched.needId);
  const zeroDuplicateProviderExecution = providerExecutions === 1;
  console.log('WS_RECONCILIATION_TELEMETRY=' + JSON.stringify({ providerExecutions, zeroDuplicateProviderExecution, closes, resultCount: matchingResults.length, reconnected: Boolean(reconnectedSocket && reconnectedSocket !== firstSocket), hostRunning: host.running, requestStatus: status.status || null }));
  assert.deepEqual(closes, [{ code: 1013, reason: 'socket_backpressure' }]);
  assert.ok(reconnectedSocket && reconnectedSocket !== firstSocket, 'provider must reconnect after confirmed 1013 socket_backpressure');
  assert.equal(providerExecutions, 1, 'zero duplicate provider execution: provider executions must equal exactly 1');
  assert.equal(zeroDuplicateProviderExecution, true);
  assert.equal(matchingResults.length, 1, 'requester must observe exactly one terminal RESULT');
  assert.equal(host.running, true);
});
