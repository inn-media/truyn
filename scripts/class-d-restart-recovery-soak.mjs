#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import dgram from 'node:dgram';
import readline from 'node:readline';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
};
const classSize = Number(arg('--class', '200'));
assert.ok([200, 500, 1000].includes(classSize), '--class must be 200, 500, or 1000');
const defaultNodes = classSize === 200 ? 6 : classSize === 500 ? 8 : 10;
const nodeCount = Number(arg('--nodes', String(defaultNodes)));
const iterations = Number(arg('--iterations', '3'));
const outDir = resolve(arg('--out-dir', `artifacts/class-d-recovery-soak-D${classSize}`));
assert.ok(Number.isInteger(nodeCount) && nodeCount >= 3 && nodeCount <= 12, '--nodes must be 3..12');
assert.ok(Number.isInteger(iterations) && iterations >= 1 && iterations <= 50, '--iterations must be 1..50');

const RECOVERY_P95_MAX_MS = 120_000;
const PORT_LEASE_DIR = join(tmpdir(), 'truyn-class-d-restart-soak-port-leases-v1');
const PORT_BASE = 22000;
const PORT_BLOCK_SIZE = 32;
const PORT_BLOCK_COUNT = 300;
const QUIC_OFFSET = 16;
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
const iso = () => new Date().toISOString();

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}
function stats(values) {
  return {
    count: values.length,
    min: values.length ? Math.min(...values) : null,
    p50: percentile(values, 0.50),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values.length ? Math.max(...values) : null
  };
}
function sum(rows, field) { return rows.reduce((total, row) => total + Number(row?.[field] || 0), 0); }
function ensureDir(path) { fs.mkdirSync(path, { recursive: true }); }
function atomicJson(path, value) {
  ensureDir(dirname(path));
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, path);
}

async function canBindTcp(port) {
  return await new Promise((resolvePromise) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolvePromise(false));
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => server.close(() => resolvePromise(true)));
  });
}
async function canBindUdp(port) {
  return await new Promise((resolvePromise) => {
    const socket = dgram.createSocket('udp4');
    socket.unref();
    socket.once('error', () => resolvePromise(false));
    socket.bind(port, '127.0.0.1', () => socket.close(() => resolvePromise(true)));
  });
}
function clearStaleLease(path) {
  try {
    const pid = Number(fs.readFileSync(path, 'utf8').trim());
    try { process.kill(pid, 0); return false; }
    catch (error) { if (error?.code !== 'ESRCH') return false; }
    fs.unlinkSync(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    try { fs.unlinkSync(path); return true; } catch { return false; }
  }
}
async function acquirePortBlock(count) {
  assert.ok(count <= QUIC_OFFSET);
  ensureDir(PORT_LEASE_DIR);
  const start = (process.pid + classSize + iterations) % PORT_BLOCK_COUNT;
  for (let offset = 0; offset < PORT_BLOCK_COUNT; offset += 1) {
    const block = (start + offset) % PORT_BLOCK_COUNT;
    const base = PORT_BASE + block * PORT_BLOCK_SIZE;
    const lock = join(PORT_LEASE_DIR, `${block}.lock`);
    let fd;
    try { fd = fs.openSync(lock, 'wx', 0o600); }
    catch (error) {
      if (error?.code === 'EEXIST') { clearStaleLease(lock); continue; }
      throw error;
    }
    fs.writeFileSync(fd, `${process.pid}\n`);
    fs.closeSync(fd);
    const controlPorts = Array.from({ length: count }, (_, i) => base + i);
    const quicPorts = Array.from({ length: count }, (_, i) => base + QUIC_OFFSET + i);
    const tcp = await Promise.all(controlPorts.map(canBindTcp));
    const udp = await Promise.all(quicPorts.map(canBindUdp));
    if (tcp.every(Boolean) && udp.every(Boolean)) {
      return {
        block, base, controlPorts, quicPorts,
        release() { try { fs.unlinkSync(lock); } catch (error) { if (error?.code !== 'ENOENT') throw error; } }
      };
    }
    try { fs.unlinkSync(lock); } catch { /* next block */ }
  }
  throw new Error('restart_soak_no_port_block');
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

class NodeProcess {
  constructor({ index, dataDir, keyPath, certPath, quicPort, controlPort }) {
    Object.assign(this, { index, dataDir, keyPath, certPath, quicPort, controlPort });
    this.child = null;
    this.stderr = '';
    this.startup = null;
  }
  get baseUrl() { return `http://127.0.0.1:${this.controlPort}`; }
  async start() {
    const started = Date.now();
    ensureDir(this.dataDir);
    this.stderr = '';
    this.child = spawn(process.execPath, ['network/testnet/node-service.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TRUYN_TESTNET_DATA_DIR: this.dataDir,
        TRUYN_TLS_KEY_PATH: this.keyPath,
        TRUYN_TLS_CERT_PATH: this.certPath,
        TRUYN_QUIC_HOST: '127.0.0.1',
        TRUYN_QUIC_PORT: String(this.quicPort),
        TRUYN_ADVERTISE_HOST: '127.0.0.1',
        TRUYN_CONTROL_HOST: '127.0.0.1',
        TRUYN_CONTROL_PORT: String(this.controlPort),
        TRUYN_PEER_RECORD_TTL_MS: '60000',
        TRUYN_DHT_REPLICATION_FACTOR: '3',
        TRUYN_DHT_WRITE_QUORUM: '2',
        TRUYN_DHT_RPC_TIMEOUT_MS: '2500',
        TRUYN_TESTNET_FAULT_CONTROL: '1',
        TRUYN_LOCAL_DEVELOPMENT: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.child.stderr.on('data', (chunk) => {
      this.stderr += chunk;
      if (this.stderr.length > 16000) this.stderr = this.stderr.slice(-16000);
    });
    const lines = readline.createInterface({ input: this.child.stdout });
    this.startup = await new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => reject(new Error(`node_${this.index}_startup_timeout:${this.stderr}`)), 20_000);
      const onExit = (code, signal) => { clearTimeout(timer); reject(new Error(`node_${this.index}_exit_${code}_${signal}:${this.stderr}`)); };
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
    return { startup: this.startup, startMs: Date.now() - started };
  }
  async stop() {
    if (!this.child || this.child.exitCode !== null) return 0;
    const started = Date.now();
    const child = this.child;
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolvePromise) => child.once('exit', resolvePromise)),
      sleep(5_000).then(() => { if (child.exitCode === null) child.kill('SIGKILL'); })
    ]);
    return Date.now() - started;
  }
}

async function request(node, path, { method = 'GET', body = null, timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${node.baseUrl}${path}`, {
      method,
      headers: body == null ? {} : { 'content-type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* retain text */ }
    return { ok: response.ok, status: response.status, json, text };
  } finally { clearTimeout(timer); }
}
function requireOk(response, label) {
  assert.equal(response.ok, true, `${label}: HTTP ${response.status}: ${response.text}`);
  return response.json;
}

async function bootstrap(nodes, seed) {
  const records = nodes.map((node) => node.startup.peerRecord);
  await Promise.all(nodes.map((node) => request(node, '/bootstrap', {
    method: 'POST', body: { records: records.filter((record) => record.nodeId !== node.startup.nodeId) }, timeoutMs: 8000
  }).then((response) => requireOk(response, `bootstrap_${node.index}`))));
  await Promise.all(nodes.map((node) => request(node, '/dht/refresh', {
    method: 'POST', body: { targetCount: nodes.length - 1, maxRounds: 4, seed: `${seed}-${node.index}` }, timeoutMs: 10_000
  }).catch(() => null)));
  await Promise.all(nodes.map((node) => request(node, '/sweep', { method: 'POST', timeoutMs: 5000 }).catch(() => null)));
}

async function waitReady(nodes, { timeoutMs = RECOVERY_P95_MAX_MS, captureRecoveryMs = false } = {}) {
  const deadline = Date.now() + timeoutMs;
  const started = Date.now();
  const readyAt = new Map();
  let lastRows = [];
  while (Date.now() < deadline) {
    lastRows = await Promise.all(nodes.map(async (node) => {
      try { return requireOk(await request(node, '/dht/readiness', { timeoutMs: 3500 }), `readiness_${node.index}`); }
      catch { return null; }
    }));
    lastRows.forEach((row, index) => {
      if (!row || readyAt.has(index)) return;
      if (row.acceptanceReady === true && row.peerRecordPropagation?.ready === true &&
          row.recoveryEpoch?.active !== true && row.recoveryEpoch?.phase === 'ready' &&
          row.validPeers >= nodes.length - 1 && row.populatedBuckets > 0) {
        readyAt.set(index, Date.now() - started);
      }
    });
    if (readyAt.size === nodes.length) return { rows: lastRows, readyMs: [...readyAt.values()] };
    await sleep(125);
  }
  const summary = lastRows.map((row, i) => ({
    i,
    ready: row?.acceptanceReady,
    phase: row?.recoveryEpoch?.phase,
    active: row?.recoveryEpoch?.active,
    validPeers: row?.validPeers,
    buckets: row?.populatedBuckets,
    propagation: row?.peerRecordPropagation
  }));
  throw new Error(`restart_soak_readiness_timeout:${JSON.stringify(summary)}`);
}

async function verifyDirectRouting(nodes, seed) {
  const results = await Promise.all(nodes.map(async (source, index) => {
    const target = nodes[(index + 1) % nodes.length];
    const response = requireOk(await request(source, '/need', {
      method: 'POST',
      body: { nodeId: target.startup.nodeId, input: { soak: seed, source: index }, allowRelayFallback: false },
      timeoutMs: 7000
    }), `direct_${source.index}_${target.index}`);
    assert.equal(response.transport, 'quic-direct');
    return response;
  }));
  return results.length;
}

function aggregateDiagnostics(rows) {
  const diagnostics = rows.map((row) => row?.recoveryDiagnostics || {});
  return {
    targetSetChanges: sum(diagnostics, 'targetSetChanges'),
    ackPreserved: sum(diagnostics, 'ackPreserved'),
    ackReset: sum(diagnostics, 'ackReset'),
    propagationAttempts: sum(diagnostics, 'propagationAttempts'),
    rpcTimeouts: sum(diagnostics, 'rpcTimeouts'),
    pendingAgeMs: stats(diagnostics.map((row) => Number(row.pendingAgeMs || 0))),
    routingRefreshMs: stats(diagnostics.map((row) => Number(row.routingRefreshMs || 0))),
    quicReplacementMs: stats(diagnostics.map((row) => Number(row.quicReplacementMs || 0)))
  };
}

async function runIteration(iteration) {
  const seed = `D${classSize}-restart-${iteration}`;
  const root = await mkdtemp(join(tmpdir(), `truyn-restart-soak-${classSize}-${iteration}-`));
  const lease = await acquirePortBlock(nodeCount);
  const tls = generateTls(root);
  const nodes = Array.from({ length: nodeCount }, (_, index) => new NodeProcess({
    index,
    dataDir: join(root, `node-${index}`),
    ...tls,
    quicPort: lease.quicPorts[index],
    controlPort: lease.controlPorts[index]
  }));
  const row = { schema: 'truyn.class-d.restart-soak.iteration.v1', classSize, nodeCount, iteration, seed, sourceSha: process.env.GITHUB_SHA || process.env.TRUYN_CLASS_D_SOURCE_SHA || null, startedAt: iso() };
  try {
    const initialStarts = await Promise.all(nodes.map((node) => node.start()));
    await bootstrap(nodes, `${seed}-initial`);
    await waitReady(nodes, { timeoutMs: 45_000 });
    row.initialStartMs = stats(initialStarts.map((value) => value.startMs));

    const stopMs = await Promise.all(nodes.map((node) => node.stop()));
    const restartStarted = Date.now();
    const restarts = await Promise.all(nodes.map((node) => node.start()));
    const ready = await waitReady(nodes, { timeoutMs: RECOVERY_P95_MAX_MS, captureRecoveryMs: true });
    const recoveryMs = ready.readyMs;
    const recoveryStats = stats(recoveryMs);
    assert.ok(recoveryStats.p95 <= RECOVERY_P95_MAX_MS, `local restart recovery p95 ${recoveryStats.p95} exceeded ${RECOVERY_P95_MAX_MS}`);
    const routed = await verifyDirectRouting(nodes, seed);

    row.status = 'PASS';
    row.stopMs = stats(stopMs);
    row.restartProcessStartMs = stats(restarts.map((value) => value.startMs));
    row.recoveryMs = recoveryStats;
    row.recoveryWallMs = Date.now() - restartStarted;
    row.recoveryHeadroomMs = RECOVERY_P95_MAX_MS - recoveryStats.p95;
    row.directQuicRoutes = routed;
    row.diagnostics = aggregateDiagnostics(ready.rows);
    row.finalPhases = [...new Set(ready.rows.map((value) => value.recoveryEpoch?.phase))];
    row.finishedAt = iso();
    return row;
  } catch (error) {
    row.status = 'FAIL';
    row.error = error?.stack || String(error);
    row.finishedAt = iso();
    return row;
  } finally {
    await Promise.allSettled(nodes.map((node) => node.stop()));
    lease.release();
    await rm(root, { recursive: true, force: true });
  }
}

ensureDir(outDir);
const jsonl = join(outDir, 'iterations.jsonl');
fs.writeFileSync(jsonl, '');
const rows = [];
for (let iteration = 1; iteration <= iterations; iteration += 1) {
  const row = await runIteration(iteration);
  rows.push(row);
  fs.appendFileSync(jsonl, `${JSON.stringify(row)}\n`);
  console.log(`TRUYN_CLASS_D_RESTART_SOAK class=D-${classSize} iteration=${iteration}/${iterations} status=${row.status} recovery_p95_ms=${row.recoveryMs?.p95 ?? -1} headroom_ms=${row.recoveryHeadroomMs ?? -1} rpc_timeouts=${row.diagnostics?.rpcTimeouts ?? -1}`);
}

const passed = rows.filter((row) => row.status === 'PASS');
const recoveryP95s = passed.map((row) => row.recoveryMs.p95);
const recoveryWorsts = passed.map((row) => row.recoveryMs.max);
const summary = {
  schema: 'truyn.class-d.restart-soak.summary.v1',
  classSize,
  nodeCount,
  iterations,
  passed: passed.length,
  failed: iterations - passed.length,
  clean: passed.length === iterations,
  sourceSha: process.env.GITHUB_SHA || process.env.TRUYN_CLASS_D_SOURCE_SHA || null,
  canonicalRecoveryP95MaxMs: RECOVERY_P95_MAX_MS,
  recoveryP95AcrossIterationsMs: stats(recoveryP95s),
  recoveryWorstAcrossIterationsMs: stats(recoveryWorsts),
  minimumHeadroomMs: passed.length ? Math.min(...passed.map((row) => row.recoveryHeadroomMs)) : null,
  diagnosticsTotals: {
    targetSetChanges: passed.reduce((v, row) => v + row.diagnostics.targetSetChanges, 0),
    ackPreserved: passed.reduce((v, row) => v + row.diagnostics.ackPreserved, 0),
    ackReset: passed.reduce((v, row) => v + row.diagnostics.ackReset, 0),
    propagationAttempts: passed.reduce((v, row) => v + row.diagnostics.propagationAttempts, 0),
    rpcTimeouts: passed.reduce((v, row) => v + row.diagnostics.rpcTimeouts, 0)
  },
  generatedAt: iso()
};
atomicJson(join(outDir, 'summary.json'), summary);
const markdown = [
  `# Class D-${classSize} restart recovery soak`, '',
  `- Source SHA: \`${summary.sourceSha || 'local'}\``,
  `- Real processes per iteration: **${nodeCount}**`,
  `- Iterations: **${iterations}**`,
  `- Passed: **${summary.passed}/${iterations}**`,
  `- Canonical recovery p95 ceiling: **${RECOVERY_P95_MAX_MS} ms**`,
  `- Worst iteration recovery p95: **${summary.recoveryP95AcrossIterationsMs.max ?? 'n/a'} ms**`,
  `- Worst single-node recovery: **${summary.recoveryWorstAcrossIterationsMs.max ?? 'n/a'} ms**`,
  `- Minimum p95 headroom: **${summary.minimumHeadroomMs ?? 'n/a'} ms**`,
  `- RPC timeouts: **${summary.diagnosticsTotals.rpcTimeouts}**`,
  `- Target-set changes: **${summary.diagnosticsTotals.targetSetChanges}**`,
  `- ACK preserved: **${summary.diagnosticsTotals.ackPreserved}**`,
  `- ACK reset: **${summary.diagnosticsTotals.ackReset}**`,
  `- Propagation attempts: **${summary.diagnosticsTotals.propagationAttempts}**`, '',
  '| Iteration | Status | Recovery p95 ms | Worst node ms | Headroom ms | RPC timeouts | Direct QUIC routes |',
  '|---:|---|---:|---:|---:|---:|---:|',
  ...rows.map((row) => `| ${row.iteration} | ${row.status} | ${row.recoveryMs?.p95 ?? '-'} | ${row.recoveryMs?.max ?? '-'} | ${row.recoveryHeadroomMs ?? '-'} | ${row.diagnostics?.rpcTimeouts ?? '-'} | ${row.directQuicRoutes ?? '-'} |`),
  ''
].join('\n');
fs.writeFileSync(join(outDir, 'summary.md'), markdown);
console.log(`TRUYN_CLASS_D_RESTART_SOAK_SUMMARY class=D-${classSize} pass=${summary.passed} fail=${summary.failed} clean=${summary.clean} worst_p95_ms=${summary.recoveryP95AcrossIterationsMs.max ?? -1} min_headroom_ms=${summary.minimumHeadroomMs ?? -1} out=${outDir}`);
if (!summary.clean) process.exitCode = 1;
