import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createProductionControlPlane } from '../core/security/production-control-plane.js';
import {
  configureRelayAccountTenantAuthority,
  configureRelayProviderGrantAuthority,
  providerPolicyFromOffer
} from '../core/security/relay-provider-policy.js';
import {
  createAuthorityCheckpointDocument,
  createCosmosAuthorityCheckpointStore
} from '../core/security/cosmos-authority-checkpoint.js';
import { createManagedProductionAuthority } from '../core/security/managed-production-authority.js';
import {
  productionControlPlaneSnapshotDigest,
  verifyProductionControlPlaneSnapshotDigest
} from '../core/security/production-control-plane-snapshot.js';
import { createAuthorityHttpClient, createAuthoritySnapshotCache } from '../runtime/authority-client.js';
import { createAuthorityService } from '../runtime/authority-service.js';
import { initializeRelayAuthorityFromEnv } from '../runtime/relay-authority-runtime.js';

function tempDir(t, prefix = 'truyn-managed-authority-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function fixture(t) {
  const provider = createIdentity();
  const requester = createIdentity();
  const stateDir = tempDir(t, 'truyn-managed-seed-');
  const control = createProductionControlPlane({
    stateDir,
    accountTenantSeed: {
      accounts: [{ accountId: 'acct' }],
      organizations: [{ organizationId: 'org', accountId: 'acct' }],
      tenants: [{ tenantId: 'tenant', organizationId: 'org' }],
      memberships: [
        { membershipId: 'provider-membership', principalId: 'provider-principal', scopeType: 'tenant', scopeId: 'tenant', roles: ['provider-operator', 'member'] },
        { membershipId: 'requester-membership', principalId: 'requester-principal', scopeType: 'tenant', scopeId: 'tenant', roles: ['member'] }
      ],
      nodeBindings: [
        { nodeId: provider.nodeId, principalId: 'provider-principal', tenantId: 'tenant' },
        { nodeId: requester.nodeId, principalId: 'requester-principal', tenantId: 'tenant' }
      ],
      providerBindings: [{ providerNodeId: provider.nodeId, providerId: 'provider' }]
    }
  });
  control.providerGrantAuthority.setProviderPolicy({ providerNodeId: provider.nodeId, mode: 'network' });
  control.entitlementAuthority.createEntitlement({
    entitlementId: 'subscription',
    subjectType: 'node',
    subjectId: requester.nodeId,
    providerNodeId: provider.nodeId,
    capabilities: ['reasoning.managed'],
    mode: 'subscription',
    period: 'day',
    maxRequests: 5,
    maxTokens: 100
  });
  const snapshot = control.snapshot();
  return { provider, requester, snapshot, digest: productionControlPlaneSnapshotDigest(snapshot) };
}

function memoryCheckpointStore({ conflictOnce = false } = {}) {
  let current = null;
  let etagCounter = 0;
  let shouldConflict = conflictOnce;
  const store = {
    maxDocumentBytes: 1_750_000,
    async read() { return current ? { document: structuredClone(current.document), etag: current.etag } : null; },
    async create({ sourceSha, state, committedAt }) {
      if (current) { const error = new Error('authority_checkpoint_conflict'); error.code = 'authority_checkpoint_conflict'; throw error; }
      const document = createAuthorityCheckpointDocument({ id: 'production-authority', partitionKey: 'production-authority', revision: 1, sourceSha, state, committedAt });
      current = { document: structuredClone(document), etag: `etag-${++etagCounter}` };
      return this.read();
    },
    async replace({ expectedEtag, revision, sourceSha, state, committedAt }) {
      if (shouldConflict) {
        shouldConflict = false;
        const error = new Error('authority_checkpoint_conflict');
        error.code = 'authority_checkpoint_conflict';
        throw error;
      }
      if (!current || expectedEtag !== current.etag) {
        const error = new Error('authority_checkpoint_conflict');
        error.code = 'authority_checkpoint_conflict';
        throw error;
      }
      const document = createAuthorityCheckpointDocument({ id: 'production-authority', partitionKey: 'production-authority', revision, sourceSha, state, committedAt });
      current = { document: structuredClone(document), etag: `etag-${++etagCounter}` };
      return this.read();
    },
    raw() { return current ? structuredClone(current) : null; }
  };
  return store;
}

const SOURCE_SHA = '1234567890abcdef1234567890abcdef12345678';

test('managed authority refuses empty production bootstrap', async () => {
  const authority = createManagedProductionAuthority({ checkpointStore: memoryCheckpointStore(), sourceSha: SOURCE_SHA });
  await assert.rejects(authority.initialize(), /production_authority_bootstrap_required/);
});

test('bootstrap digest is mandatory and tamper evident', (t) => {
  const { snapshot, digest } = fixture(t);
  assert.equal(verifyProductionControlPlaneSnapshotDigest(snapshot, digest), digest);
  const tampered = structuredClone(snapshot);
  tampered.accountTenant.accountTenant.accounts[0].status = 'removed';
  assert.throws(() => verifyProductionControlPlaneSnapshotDigest(tampered, digest), /production_authority_snapshot_digest_mismatch/);
});

test('managed revocation commits through checkpoint and survives restart', { concurrency: false }, async (t) => {
  const { provider, requester, snapshot, digest } = fixture(t);
  const store = memoryCheckpointStore();
  const first = createManagedProductionAuthority({ checkpointStore: store, sourceSha: SOURCE_SHA, bootstrapSnapshot: snapshot, bootstrapDigest: digest, temporaryRoot: tempDir(t) });
  const initialized = await first.initialize();
  assert.equal(initialized.revision, 1);
  assert.equal((await first.authorizeAccess({ providerNodeId: provider.nodeId, requesterNodeId: requester.nodeId, capability: 'reasoning.managed' })).ok, true);

  const revoked = await first.adminMutate({ operation: 'revoke', input: { kind: 'membership', id: 'requester-membership', reason: 'test' } });
  assert.equal(revoked.authorityRevision, 2);
  assert.equal((await first.authorizeAccess({ providerNodeId: provider.nodeId, requesterNodeId: requester.nodeId, capability: 'reasoning.managed' })).reason, 'membership_revoked');

  const restarted = createManagedProductionAuthority({ checkpointStore: store, sourceSha: SOURCE_SHA, temporaryRoot: tempDir(t) });
  assert.equal((await restarted.initialize()).revision, 2);
  const decision = await restarted.authorizeAccess({ providerNodeId: provider.nodeId, requesterNodeId: requester.nodeId, capability: 'reasoning.managed' });
  assert.equal(decision.ok, false);
  assert.equal(decision.reason, 'membership_revoked');
  assert.equal(store.raw().document.stateDigest, productionControlPlaneSnapshotDigest(store.raw().document.state));
});

test('managed mutation retries an optimistic ETag conflict without acknowledging an uncommitted write', { concurrency: false }, async (t) => {
  const { snapshot, digest } = fixture(t);
  const store = memoryCheckpointStore({ conflictOnce: true });
  const authority = createManagedProductionAuthority({ checkpointStore: store, sourceSha: SOURCE_SHA, bootstrapSnapshot: snapshot, bootstrapDigest: digest, temporaryRoot: tempDir(t), maxMutationRetries: 3 });
  await authority.initialize();
  const result = await authority.adminMutate({ operation: 'revoke', input: { kind: 'membership', id: 'requester-membership', reason: 'conflict-retry' } });
  assert.equal(result.authorityRevision, 2);
  assert.equal(store.raw().document.revision, 2);
});

test('relay snapshot cache is monotonic and fails closed after staleness budget', { concurrency: false }, async (t) => {
  const { provider, requester, snapshot } = fixture(t);
  let now = 1_000;
  const first = createAuthorityCheckpointDocument({ id: 'production-authority', partitionKey: 'production-authority', revision: 1, sourceSha: SOURCE_SHA, state: snapshot, committedAt: '2026-09-05T00:00:00.000Z' });
  let remote = { revision: first.revision, sourceSha: first.sourceSha, committedAt: first.committedAt, stateDigest: first.stateDigest, state: first.state };
  const client = { async snapshot() { return structuredClone(remote); } };
  const cache = createAuthoritySnapshotCache({ client, stateDir: tempDir(t, 'truyn-relay-authority-cache-'), refreshMs: 100, maxStaleMs: 500, nowMs: () => now });
  await cache.initialize();
  assert.equal(cache.providerGrantAuthority.authorize({ providerNodeId: provider.nodeId, requesterNodeId: requester.nodeId, capability: 'reasoning.managed' }).ok, true);

  now += 501;
  assert.throws(() => cache.providerGrantAuthority.authorize({ providerNodeId: provider.nodeId, requesterNodeId: requester.nodeId, capability: 'reasoning.managed' }), /authority_snapshot_stale/);

  now += 1;
  await cache.refresh();
  assert.equal(cache.status().ready, true);

  remote = { ...remote, revision: 0 };
  await assert.rejects(cache.refresh(), /authority_snapshot_revision_invalid|authority_snapshot_rollback_detected/);
  cache.stop();
});

test('relay snapshot cache persists high-water revision across process restart', { concurrency: false }, async (t) => {
  const { snapshot } = fixture(t);
  const cacheDir = tempDir(t, 'truyn-relay-high-water-');
  const revisionTwo = createAuthorityCheckpointDocument({
    id: 'production-authority',
    partitionKey: 'production-authority',
    revision: 2,
    sourceSha: SOURCE_SHA,
    state: snapshot,
    committedAt: '2026-09-05T00:00:02.000Z'
  });
  let remote = { revision: revisionTwo.revision, sourceSha: revisionTwo.sourceSha, committedAt: revisionTwo.committedAt, stateDigest: revisionTwo.stateDigest, state: revisionTwo.state };
  const client = { async snapshot() { return structuredClone(remote); } };
  const first = createAuthoritySnapshotCache({ client, stateDir: cacheDir, refreshMs: 100, maxStaleMs: 500 });
  await first.initialize();
  assert.equal(first.status().acceptedRevision, 2);
  first.stop();

  const revisionOne = createAuthorityCheckpointDocument({
    id: 'production-authority',
    partitionKey: 'production-authority',
    revision: 1,
    sourceSha: SOURCE_SHA,
    state: snapshot,
    committedAt: '2026-09-05T00:00:01.000Z'
  });
  remote = { revision: revisionOne.revision, sourceSha: revisionOne.sourceSha, committedAt: revisionOne.committedAt, stateDigest: revisionOne.stateDigest, state: revisionOne.state };
  const restarted = createAuthoritySnapshotCache({ client, stateDir: cacheDir, refreshMs: 100, maxStaleMs: 500 });
  await assert.rejects(restarted.initialize(), /authority_snapshot_rollback_detected/);
});

test('authority HTTP timeout remains active through response body read', async () => {
  const fetchImpl = async (_url, options) => ({
    ok: true,
    status: 200,
    async json() {
      return await new Promise((resolve, reject) => {
        if (options.signal.aborted) return reject(options.signal.reason);
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
    }
  });
  const client = createAuthorityHttpClient({ baseUrl: 'https://authority.internal', token: 'runtime-token', fetchImpl, requestTimeoutMs: 100 });
  await assert.rejects(client.snapshot(), /authority_request_timeout/);
});

test('authority readiness revalidates checkpoint-store availability after startup', { concurrency: false }, async (t) => {
  let failCheckpoint = false;
  const authority = {
    async initialize() { return { ready: true }; },
    async checkpoint() {
      if (failCheckpoint) throw new Error('checkpoint_unavailable');
      return { revision: 1 };
    }
  };
  const service = createAuthorityService({ authority, runtimeToken: 'runtime-token', adminToken: 'admin-token' });
  const url = await service.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => service.close());
  assert.equal((await fetch(`${url}/ready`)).status, 200);
  failCheckpoint = true;
  assert.equal((await fetch(`${url}/ready`)).status, 503);
  assert.equal(service.ready, false);
});

test('relay managed authority remains installed while shutdown stops refreshes', { concurrency: false }, async (t) => {
  const { provider, snapshot } = fixture(t);
  const checkpoint = createAuthorityCheckpointDocument({
    id: 'production-authority',
    partitionKey: 'production-authority',
    revision: 1,
    sourceSha: SOURCE_SHA,
    state: snapshot,
    committedAt: '2026-09-05T00:00:00.000Z'
  });
  const client = { async snapshot() { return structuredClone({ revision: checkpoint.revision, sourceSha: checkpoint.sourceSha, committedAt: checkpoint.committedAt, stateDigest: checkpoint.stateDigest, state: checkpoint.state }); } };
  configureRelayProviderGrantAuthority(null);
  configureRelayAccountTenantAuthority(null);
  t.after(() => {
    configureRelayProviderGrantAuthority(null);
    configureRelayAccountTenantAuthority(null);
  });
  const runtime = await initializeRelayAuthorityFromEnv({
    TRUYN_AUTHORITY_URL: 'https://authority.internal',
    TRUYN_AUTHORITY_RUNTIME_TOKEN: 'runtime-token',
    TRUYN_AUTHORITY_CACHE_DIR: tempDir(t, 'truyn-relay-shutdown-'),
    TRUYN_AUTHORITY_REFRESH_MS: '100',
    TRUYN_AUTHORITY_MAX_STALE_MS: '500'
  }, { client });
  const envelope = { from: provider.nodeId, payload: { capability: { name: 'reasoning.managed' }, metadata: { accessMode: 'public' } } };
  assert.equal(providerPolicyFromOffer(envelope).accessMode, 'authority');
  runtime.stop();
  assert.equal(providerPolicyFromOffer(envelope).accessMode, 'authority');
});

test('Cosmos checkpoint uses managed identity AAD auth and ETag conditional replacement', async () => {
  const state = {
    accountTenant: { version: 1, revision: 0, accountTenant: { accounts: [], organizations: [], tenants: [], memberships: [], nodeBindings: [], providerBindings: [] } },
    revocations: { version: 1, revision: 0, revocations: {} },
    grants: { version: 1, revision: 0, providerPolicies: {}, grants: {} },
    entitlements: { version: 1, revision: 0, entitlements: {} },
    accounting: { version: 1, revision: 0, ledgers: {}, reservations: {} }
  };
  const existing = createAuthorityCheckpointDocument({ id: 'production-authority', partitionKey: 'production-authority', revision: 1, sourceSha: SOURCE_SHA, state, committedAt: '2026-09-05T00:00:00.000Z' });
  const requests = [];
  const fakeHeaders = (etag) => ({ get(name) { return name.toLowerCase() === 'etag' ? etag : null; } });
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (options.method === 'GET') return { ok: true, status: 200, headers: fakeHeaders('etag-1'), async json() { return existing; } };
    if (options.method === 'PUT') {
      const next = JSON.parse(options.body);
      return { ok: true, status: 200, headers: fakeHeaders('etag-2'), async json() { return next; } };
    }
    throw new Error(`unexpected method ${options.method}`);
  };
  let tokenResource = null;
  const store = createCosmosAuthorityCheckpointStore({
    endpoint: 'https://example.documents.azure.com:443',
    database: 'truyn',
    container: 'authority',
    fetchImpl,
    accessTokenProvider: async ({ resource }) => { tokenResource = resource; return 'managed-identity-token'; },
    now: () => new Date('2026-09-05T00:00:01.000Z')
  });

  const read = await store.read();
  assert.equal(read.etag, 'etag-1');
  await store.replace({ expectedEtag: read.etag, revision: 2, sourceSha: SOURCE_SHA, state, committedAt: '2026-09-05T00:00:02.000Z' });
  assert.equal(tokenResource, 'https://cosmos.azure.com/');
  assert.match(requests[0].options.headers.authorization, /type%3Daad%26ver%3D1.0%26sig%3Dmanaged-identity-token/);
  assert.equal(requests[0].options.headers['x-ms-documentdb-partitionkey'], '["production-authority"]');
  assert.equal(requests[1].options.headers['if-match'], 'etag-1');
});
