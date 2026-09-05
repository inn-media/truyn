import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProductionControlPlane } from '../core/security/production-control-plane.js';
import { createAuthorityCheckpointDocument } from '../core/security/cosmos-authority-checkpoint.js';
import { createManagedProductionAuthority } from '../core/security/managed-production-authority.js';
import { productionControlPlaneSnapshotDigest } from '../core/security/production-control-plane-snapshot.js';
import { createAuthorityService } from '../runtime/authority-service.js';
import { createOriginGuard } from '../runtime/origin-guard.js';
import { installRelayAuthorityReadiness } from '../runtime/relay-readiness.js';

const SOURCE_SHA = '1234567890abcdef1234567890abcdef12345678';

function tempDir(t, prefix = 'truyn-authority-readiness-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function memoryCheckpointStore() {
  let current = null;
  let etag = 0;
  return {
    maxDocumentBytes: 1_750_000,
    async read() { return current ? { document: structuredClone(current.document), etag: current.etag } : null; },
    async create({ sourceSha, state, committedAt }) {
      const document = createAuthorityCheckpointDocument({ id: 'production-authority', partitionKey: 'production-authority', revision: 1, sourceSha, state, committedAt });
      current = { document: structuredClone(document), etag: `etag-${++etag}` };
      return this.read();
    },
    async replace() { throw new Error('unexpected_replace'); }
  };
}

test('authority readiness recovers from transient checkpoint outage without process restart', { concurrency: false }, async (t) => {
  let checkpointAvailable = true;
  const authority = {
    async initialize() { return { ready: true }; },
    async checkpoint() {
      if (!checkpointAvailable) throw new Error('checkpoint_unavailable');
      return { revision: 1 };
    }
  };
  const service = createAuthorityService({ authority, runtimeToken: 'runtime-token', adminToken: 'admin-token' });
  const url = await service.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => service.close());

  assert.equal((await fetch(`${url}/ready`)).status, 200);
  checkpointAvailable = false;
  assert.equal((await fetch(`${url}/ready`)).status, 503);
  assert.equal(service.ready, false);
  checkpointAvailable = true;
  assert.equal((await fetch(`${url}/ready`)).status, 200);
  assert.equal(service.ready, true);
});

test('relay readiness follows authority cache status and preserves normal request handler', { concurrency: false }, async (t) => {
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

test('origin guard forwards unauthenticated readiness but still denies unauthenticated data plane', { concurrency: false }, async (t) => {
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

test('managed authority rejects owner-funded and BYOK as local-only without mutating checkpoint', { concurrency: false }, async (t) => {
  const control = createProductionControlPlane({ stateDir: tempDir(t, 'truyn-authority-local-only-') });
  const snapshot = control.snapshot();
  const store = memoryCheckpointStore();
  const authority = createManagedProductionAuthority({
    checkpointStore: store,
    sourceSha: SOURCE_SHA,
    bootstrapSnapshot: snapshot,
    bootstrapDigest: productionControlPlaneSnapshotDigest(snapshot),
    temporaryRoot: tempDir(t, 'truyn-authority-local-engine-')
  });
  await authority.initialize();
  for (const mode of ['owner-funded', 'byok']) {
    const result = await authority.reserveBilling({
      providerNodeId: 'truyn:node:provider',
      mode,
      need: { id: `need-${mode}`, from: 'truyn:node:owner', payload: { capability: { name: 'test' } } },
      estimatedTokens: 1
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'managed_billing_mode_local_only');
  }
  assert.equal((await authority.checkpoint()).revision, 1);
});
