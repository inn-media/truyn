import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { createHash } from 'node:crypto';

// A disposable loopback test link, not a general-purpose forward proxy.
// The upstream host and one permitted GET path come exclusively from fixed
// test configuration. Inbound request URLs NEVER construct an upstream URL.
export function createG5ReadOnlyCosmosLink({ endpoint, database, container, logicalId,
  requestImpl = https.request } = {}) {
  const target = new URL(endpoint);
  assert.equal(target.protocol, 'https:');
  assert.match(target.hostname, /^[a-z0-9.-]+\.documents\.azure\.com$/i);
  assert.ok(!target.username && !target.password && !target.search && !target.hash);
  assert.ok(!target.port || target.port === '443');
  assert.equal(target.pathname, '/');
  for (const value of [database, container]) assert.match(value || '', /^[a-zA-Z0-9._-]{1,100}$/);
  assert.equal(typeof logicalId, 'string');
  assert.ok(logicalId.length > 0 && logicalId.length <= 4070);
  assert.equal(typeof requestImpl, 'function');
  const documentId = 'need-' + createHash('sha256').update(logicalId).digest('hex');
  const path = '/dbs/' + encodeURIComponent(database) + '/colls/' +
    encodeURIComponent(container) + '/docs/' + documentId;
  const hostname = target.hostname;
  const sourceOrigin = target.origin;
  const headerNames = ['authorization', 'x-ms-date', 'x-ms-version',
    'x-ms-consistency-level', 'x-ms-session-token', 'x-ms-documentdb-partitionkey', 'accept'];
  let server = null, port = null;
  const sockets = new Set(), upstreams = new Set();
  async function open() {
    if (server) throw new Error('g5_test_link_already_open');
    const candidate = http.createServer((req, res) => {
      if (req.method !== 'GET' || req.url !== path || req.headers['transfer-encoding'] ||
          (req.headers['content-length'] && req.headers['content-length'] !== '0')) {
        req.resume(); res.writeHead(400).end(); return;
      }
      const headers = {};
      for (const name of headerNames) if (typeof req.headers[name] === 'string') headers[name] = req.headers[name];
      // Neither req.url nor req.headers.host is passed to HTTPS.
      let upstream;
      try {
        upstream = requestImpl({ protocol: 'https:', hostname, port: 443,
          method: 'GET', path, headers, timeout: 8000 }, incoming => {
          res.writeHead(incoming.statusCode, incoming.headers);
          incoming.on('error', () => res.destroy());
          incoming.pipe(res);
        });
      } catch { res.writeHead(502).end(); return; }
      upstreams.add(upstream);
      upstream.on('close', () => upstreams.delete(upstream));
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502).end(); else res.destroy();
      });
      req.on('aborted', () => upstream.destroy());
      res.on('close', () => upstream.destroy());
      upstream.end();
    });
    candidate.on('connection', socket => {
      sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    });
    server = candidate;
    try {
      await new Promise((resolve, reject) => {
        candidate.once('error', reject);
        candidate.listen(0, '127.0.0.1', () => { candidate.removeListener('error', reject); resolve(); });
      });
      port = candidate.address().port;
    } catch (error) { server = null; throw error; }
  }
  async function cut() {
    if (!server) return;
    const previous = server;
    server = null;
    const closed = new Promise((resolve, reject) => previous.close(error => error ? reject(error) : resolve()));
    for (const upstream of upstreams) upstream.destroy();
    for (const socket of sockets) socket.destroy();
    await closed;
  }
  async function fetchImpl(uri, options = {}) {
    const supplied = new URL(uri);
    if (supplied.origin !== sourceOrigin || supplied.pathname !== path || supplied.search || supplied.hash ||
        supplied.username || supplied.password || options.method !== 'GET' || options.body != null)
      throw new Error('g5_test_link_request_not_allowed');
    if (port === null) throw new Error('g5_test_link_not_started');
    // Keep the last closed port so the fault leg exercises an actual TCP failure.
    return fetch('http://127.0.0.1:' + port + path, { ...options, redirect: 'error' });
  }
  return Object.freeze({ open, cut, close: cut, fetchImpl,
    get localOrigin() { return port === null ? null : 'http://127.0.0.1:' + port; },
    get upstreamUrl() { return sourceOrigin + path; }
  });
}
