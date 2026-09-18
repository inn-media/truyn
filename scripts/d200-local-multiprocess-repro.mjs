#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import dgram from 'node:dgram';
import readline from 'node:readline';

const repoRoot = process.cwd();
const scenario = process.argv.includes('--scenario') ? process.argv[process.argv.indexOf('--scenario') + 1] : 'all';
const sizeArg = process.argv.includes('--nodes') ? Number(process.argv[process.argv.indexOf('--nodes') + 1]) : 6;
const nodeCount = Number.isInteger(sizeArg) && sizeArg >= 3 && sizeArg <= 12 ? sizeArg : 6;
const resultArg = process.argv.includes('--result') ? process.argv[process.argv.indexOf('--result') + 1] : null;
const allowed = new Set(['topology', 'readiness', 'routing', 'durability', 'recovery', 'renewal', 'all']);
if (!allowed.has(scenario)) throw new Error(`unknown scenario: ${scenario}`);

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
async function eventually(fn, timeoutMs = 12000, intervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try { const value = await fn(); if (value) return value; }
    catch (error) { lastError = error; }
    await sleep(intervalMs);
  }
  if (lastError) throw lastError;
  throw new Error(`condition_not_met_within_${timeoutMs}ms`);
}
async function freeTcpPort() {
  return await new Promise((resolvePromise, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolvePromise(port));
    });
  });
}
async function freeUdpPort() {
  return await new Promise((resolvePromise, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.unref();
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolvePromise(port));
    });
  });
}
function generateTls(root) {
  const keyPath = join(root, 'key.pem');
  const certPath = join(root, 'cert.pem');
  const run = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath,
    '-subj', '/CN=127.0.0.1', '-days', '1',
    '-addext', 'subjectAltName=IP:127.0.0.1'
  ], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`openssl failed: ${run.stderr}`);
  return { keyPath, certPath };
}

class LocalNodeProcess {
  constructor({ index, root, keyPath, certPath, quicPort, controlPort, ttlMs = 10000 }) {
    this.index = index;
    this.root = root;
    this.keyPath = keyPath;
    this.certPath = certPath;
    this.quicPort = quicPort;
    this.controlPort = controlPort;
    this.ttlMs = ttlMs;
    this.child = null;
    this.startup = null;
    this.stderr = '';
  }
  get baseUrl() { return `http://127.0.0.1:${this.controlPort}`; }
  async start() {
    const dataDir = join(this.root, `node-${this.index}`);
    fs.mkdirSync(dataDir, { recursive: true });
    const env = {
      ...process.env,
      TRUYN_TESTNET_DATA_DIR: dataDir,
      TRUYN_TLS_KEY_PATH: this.keyPath,
      TRUYN_TLS_CERT_PATH: this.certPath,
      TRUYN_QUIC_HOST: '127.0.0.1',
      TRUYN_QUIC_PORT: String(this.quicPort),
      TRUYN_ADVERTISE_HOST: '127.0.0.1',
      TRUYN_CONTROL_HOST: '127.0.0.1',
      TRUYN_CONTROL_PORT: String(this.controlPort),
      TRUYN_PEER_RECORD_TTL_MS: String(this.ttlMs),
      TRUYN_DHT_REPLICATION_FACTOR: '3',
      TRUYN_DHT_WRITE_QUORUM: '2',
      TRUYN_DHT_RPC_TIMEOUT_MS: '1200',
      TRUYN_TESTNET_FAULT_CONTROL: '1',
      TRUYN_LOCAL_DEVELOPMENT: '1'
    };
    this.child = spawn(process.execPath, ['network/testnet/node-service.js'], { cwd: repoRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
    this.child.stderr.on('data', (chunk) => { this.stderr += chunk; if (this.stderr.length > 16000) this.stderr = this.stderr.slice(-16000); });
    const lines = readline.createInterface({ input: this.child.stdout });
    this.startup = await new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error(`node ${this.index} startup timeout stderr=${this.stderr}`)), 15000);
      const onExit = (code, signal) => { clearTimeout(timer); reject(new Error(`node ${this.index} exited before startup code=${code} signal=${signal} stderr=${this.stderr}`)); };
      this.child.once('exit', onExit);
      lines.on('line', (line) => {
        try {
          const value = JSON.parse(line);
          if (value?.ok && value?.nodeId && value?.peerRecord) {
            clearTimeout(timer);
            this.child.off('exit', onExit);
            resolvePromise(value);
          }
        } catch { /* runtime logs may share stdout */ }
      });
    });
    return this;
  }
  async stop() {
    if (!this.child || this.child.exitCode !== null) return;
    const child = this.child;
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolvePromise) => child.once('exit', () => resolvePromise())),
      sleep(4000).then(() => { if (child.exitCode === null) child.kill('SIGKILL'); })
    ]);
  }
}

async function request(node, pathname, { method = 'GET', body = null, timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${node.baseUrl}${pathname}`, {
      method,
      headers: body == null ? {} : { 'content-type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* preserve raw text */ }
    return { status: response.status, ok: response.ok, json, text };
  } finally { clearTimeout(timer); }
}
function requireOk(response, label) {
  assert.equal(response.ok, true, `${label} expected HTTP 2xx, got ${response.status}: ${response.text}`);
  return response.json;
}

async function createCluster(count = nodeCount, ttlMs = 10000) {
  const root = await mkdtemp(join(tmpdir(), 'truyn-d200-local-multiprocess-'));
  const tls = generateTls(root);
  const specs = [];
  for (let i = 0; i < count; i += 1) specs.push({ index: i, root, ...tls, quicPort: await freeUdpPort(), controlPort: await freeTcpPort(), ttlMs });
  const nodes = specs.map((spec) => new LocalNodeProcess(spec));
  try { await Promise.all(nodes.map((node) => node.start())); }
  catch (error) {
    await Promise.allSettled(nodes.map((node) => node.stop()));
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  return { root, nodes, async close() { await Promise.allSettled(nodes.map((node) => node.stop())); await rm(root, { recursive: true, force: true }); } };
}

async function bootstrapMesh(nodes) {
  const records = nodes.map((node) => node.startup.peerRecord);
  await Promise.all(nodes.map(async (node) => {
    const response = await request(node, '/bootstrap', { method: 'POST', body: { records: records.filter((record) => record.nodeId !== node.startup.nodeId) }, timeoutMs: 8000 });
    requireOk(response, `bootstrap node=${node.index}`);
  }));
  await Promise.allSettled(nodes.map((node) => request(node, '/dht/refresh', { method: 'POST', body: { targetCount: Math.min(nodes.length - 1, 8), maxRounds: 2, seed: `local-${node.index}` }, timeoutMs: 8000 })));
}

async function assertTopology(nodes) {
  const statuses = await Promise.all(nodes.map(async (node) => requireOk(await request(node, '/status'), `status node=${node.index}`)));
  assert.equal(new Set(statuses.map((value) => value.nodeId)).size, nodes.length, 'local repro must use unique identities');
  assert.equal(new Set(statuses.map((value) => value.quicPort)).size, nodes.length, 'local repro must use unique QUIC sockets');
  return { nodes: nodes.length, uniqueIdentities: nodes.length, uniqueSockets: nodes.length };
}
async function assertReadiness(nodes) {
  const targetPeers = nodes.length - 1;
  return await eventually(async () => {
    const rows = await Promise.all(nodes.map(async (node) => requireOk(await request(node, '/dht/readiness', { timeoutMs: 3000 }), `readiness node=${node.index}`)));
    const ready = rows.filter((row) => row.acceptanceReady === true && row.peerRecordPropagation?.ready === true && row.validPeers >= targetPeers && row.populatedBuckets > 0);
    if (ready.length !== nodes.length) return false;
    return { ready: ready.length, total: nodes.length, minValidPeers: Math.min(...rows.map((row) => row.validPeers)), minBuckets: Math.min(...rows.map((row) => row.populatedBuckets)) };
  }, 15000, 150);
}
async function assertRouting(nodes, label = 'routing') {
  const rows = await Promise.all(nodes.map(async (source, i) => {
    const target = nodes[(i + 1) % nodes.length];
    const response = await request(source, '/need', { method: 'POST', body: { nodeId: target.startup.nodeId, input: { scenario: label, source: i }, allowRelayFallback: false }, timeoutMs: 5000 });
    const value = requireOk(response, `${label} ${source.index}->${target.index}`);
    assert.equal(value.transport, 'quic-direct', `${label} must use direct QUIC`);
    return value;
  }));
  return { success: rows.length, total: nodes.length };
}
async function assertDurability(nodes) {
  const writes = [];
  for (let i = 0; i < nodes.length * 2; i += 1) {
    const source = nodes[i % nodes.length];
    writes.push(request(source, '/replicate', { method: 'POST', body: { namespace: 'd200-local', key: `key-${i}`, value: { i, source: source.index }, replicationFactor: 3, minAcks: 2, ttlMs: 60000 }, timeoutMs: 8000 }).then((response) => {
      const value = requireOk(response, `replicate key-${i}`);
      assert.ok(value.result?.acknowledgements >= 2, `key-${i} missing quorum`);
      return value;
    }));
  }
  const written = await Promise.all(writes);
  const checks = await Promise.all([0, Math.floor(nodes.length), nodes.length * 2 - 1].map(async (i, offset) => {
    const reader = nodes[(offset + 2) % nodes.length];
    const response = await request(reader, `/find?namespace=d200-local&key=key-${i}&fanout=6`, { timeoutMs: 8000 });
    const value = requireOk(response, `find key-${i}`);
    assert.ok(Array.isArray(value.records) && value.records.some((record) => record.key === `key-${i}`), `key-${i} not readable from remote node`);
    return value.records.length;
  }));
  return { writes: written.length, remoteReads: checks.length, minAcks: Math.min(...written.map((value) => value.result.acknowledgements)) };
}
async function assertRecovery(nodes) {
  const source = nodes[0];
  const target = nodes[1];
  requireOk(await request(source, '/faults/partition', { method: 'POST', body: { nodeIds: [target.startup.nodeId] } }), 'partition');
  const blocked = await request(source, '/need', { method: 'POST', body: { nodeId: target.startup.nodeId, input: { partitioned: true }, allowRelayFallback: false }, timeoutMs: 4000 });
  assert.equal(blocked.ok, false, 'partitioned NEED must fail');
  assert.equal(blocked.json?.error, 'TRUYN_NETWORK_PARTITION', `unexpected partition error: ${blocked.text}`);
  requireOk(await request(source, '/faults/heal', { method: 'POST', body: { nodeIds: [target.startup.nodeId] } }), 'heal');
  const recovered = await eventually(async () => {
    const response = await request(source, '/need', { method: 'POST', body: { nodeId: target.startup.nodeId, input: { healed: true }, allowRelayFallback: false }, timeoutMs: 4000 });
    return response.ok && response.json?.transport === 'quic-direct' ? response.json : false;
  }, 8000, 150);
  return { partitionFailure: blocked.json?.error, healedTransport: recovered.transport };
}
async function assertRenewal(nodes) {
  const before = await Promise.all(nodes.map(async (node) => requireOk(await request(node, '/record'), `record before node=${node.index}`).record.sequence));
  const renewed = await eventually(async () => {
    const rows = await Promise.all(nodes.map(async (node) => requireOk(await request(node, '/record'), `record after node=${node.index}`).record.sequence));
    return rows.every((sequence, i) => sequence > before[i]) ? rows : false;
  }, 12000, 150);
  const routing = await assertRouting(nodes, 'post-renewal-routing');
  return { renewed: renewed.length, total: nodes.length, minSequenceAdvance: Math.min(...renewed.map((sequence, i) => sequence - before[i])), routingSuccess: routing.success };
}

async function runScenario(name) {
  const ttlMs = name === 'renewal' || name === 'all' ? 6000 : 12000;
  const cluster = await createCluster(nodeCount, ttlMs);
  const evidence = { scenario: name, nodeCount, stages: {}, startedAt: new Date().toISOString() };
  try {
    evidence.stages.topology = await assertTopology(cluster.nodes);
    await bootstrapMesh(cluster.nodes);
    if (['readiness', 'routing', 'durability', 'recovery', 'renewal', 'all'].includes(name)) evidence.stages.readiness = await assertReadiness(cluster.nodes);
    if (['routing', 'recovery', 'all'].includes(name)) evidence.stages.routing = await assertRouting(cluster.nodes);
    if (['durability', 'all'].includes(name)) evidence.stages.durability = await assertDurability(cluster.nodes);
    if (['recovery', 'all'].includes(name)) evidence.stages.recovery = await assertRecovery(cluster.nodes);
    if (['renewal', 'all'].includes(name)) evidence.stages.renewal = await assertRenewal(cluster.nodes);
    evidence.status = 'PASS';
    evidence.finishedAt = new Date().toISOString();
    return evidence;
  } finally { await cluster.close(); }
}

let evidence;
try {
  evidence = await runScenario(scenario);
  console.log(`TRUYN_D200_LOCAL_MULTIPROCESS scenario=${scenario} nodes=${nodeCount} status=PASS stages=${Object.keys(evidence.stages).join(',')}`);
} catch (error) {
  evidence = { scenario, nodeCount, status: 'FAIL', error: error?.stack || String(error), finishedAt: new Date().toISOString() };
  console.error(`TRUYN_D200_LOCAL_MULTIPROCESS scenario=${scenario} nodes=${nodeCount} status=FAIL error=${String(error?.message || error).replace(/\s+/g, '_')}`);
  process.exitCode = 1;
}
if (resultArg) fs.writeFileSync(resolve(resultArg), `${JSON.stringify(evidence, null, 2)}\n`);
