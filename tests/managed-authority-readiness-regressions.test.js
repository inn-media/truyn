import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOriginGuard } from '../runtime/origin-guard.js';
import { installRelayAuthorityReadiness } from '../runtime/relay-readiness.js';

test('relay readiness follows an injected authority runtime status and preserves normal request handler', async (t) => {
  let status = { ready: true, revision: 7, snapshotAgeMs: 10 };
  const readyChanges = [];
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    res.writeHead(404);
    res.end();
  });
  const readiness = installRelayAuthorityReadiness(server, {
    statusProvider: () => status,
    onReadyChange: (ready) => readyChanges.push(ready),
    pollMs: 60_000
  });
  t.after(() => readiness.stop());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;

  let response = await fetch(`http://127.0.0.1:${port}/ready`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, authorityRevision: 7, authoritySnapshotAgeMs: 10 });
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);

  status = { ready: false, revision: 7, snapshotAgeMs: 5001 };
  readiness.publish();
  response = await fetch(`http://127.0.0.1:${port}/ready`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).ok, false);
  assert.deepEqual(readyChanges, [true, false]);
});

test('origin guard forwards unauthenticated readiness but still denies unauthenticated data plane', async (t) => {
  const inner = http.createServer((req, res) => {
    if (req.url === '/ready') {
      res.writeHead(503, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ok: false }));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve) => inner.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => inner.close(resolve)));
  const guard = createOriginGuard({
    targetHost: '127.0.0.1',
    targetPort: inner.address().port,
    token: 'frontdoor-proof',
    headerName: 'x-azure-fdid'
  });
  const guardUrl = await guard.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => guard.close());

  assert.equal((await fetch(`${guardUrl}/ready`)).status, 503);
  assert.equal((await fetch(`${guardUrl}/v1/offers`)).status, 403);
  assert.equal((await fetch(`${guardUrl}/v1/offers`, { headers: { 'x-azure-fdid': 'frontdoor-proof' } })).status, 200);
});
