import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createClaim, createAttestation } from '../core/claims/index.js';
import { createProductionControlPlane } from '../core/security/production-control-plane.js';
import { createProductionRevocationAuthority } from '../core/security/production-revocation-authority.js';
import {
  createBoundedRevocationReplication,
  createRevocationDecisionCache
} from '../core/security/operational-revocation.js';
import { createLineageCertificate } from '../core/trust/lifecycle.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

const ACTOR = Object.freeze({ authorityId: 'ops-root', keyId: 'ops-key-1' });

function tempDir(t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function fixture() {
  const provider = createIdentity();
  const requester = createIdentity();
  return {
    provider,
    requester,
    seed: {
      accounts: [{ accountId: 'acct-a' }],
      organizations: [{ organizationId: 'org-a', accountId: 'acct-a' }],
      tenants: [{ tenantId: 'tenant-a', organizationId: 'org-a' }],
      memberships: [
        { membershipId: 'm-provider', principalId: 'principal-provider', scopeType: 'tenant', scopeId: 'tenant-a', roles: ['provider-operator', 'member'] },
        { membershipId: 'm-requester', principalId: 'principal-requester', scopeType: 'tenant', scopeId: 'tenant-a', roles: ['member'] }
      ],
      nodeBindings: [
        { nodeId: provider.nodeId, principalId: 'principal-provider', tenantId: 'tenant-a' },
        { nodeId: requester.nodeId, principalId: 'principal-requester', tenantId: 'tenant-a' }
      ],
      providerBindings: [{ providerNodeId: provider.nodeId, providerId: 'provider-main' }]
    }
  };
}

function makePair(t, { trustEvidenceIds = new Set() } = {}) {
  const sourceDir = tempDir(t, 'truyn-revoke-source-');
  const consumerDir = tempDir(t, 'truyn-revoke-consumer-');
  const replicaDir = tempDir(t, 'truyn-revoke-replica-');
  const data = fixture();
  let clock = Date.parse('2026-09-05T10:00:00.000Z');
  const now = () => new Date(clock);

  const authorize = ({ actor, scope, targetId }) => {
    if (actor.authorityId !== ACTOR.authorityId || actor.keyId !== ACTOR.keyId) return { ok: false, reason: 'actor_not_authorized' };
    if (scope?.environment !== 'production') return { ok: false, reason: 'scope_not_authorized' };
    if (scope?.targetId !== targetId) return { ok: false, reason: 'scope_target_mismatch' };
    return { ok: true };
  };
  const validateExternal = ({ kind, targetId }) => {
    if (kind !== 'trust-evidence') return { ok: true };
    return trustEvidenceIds.has(targetId) ? { ok: true } : { ok: false, reason: 'trust_evidence_not_found' };
  };

  const source = createProductionControlPlane({
    stateDir: sourceDir,
    accountTenantSeed: data.seed,
    now,
    operationalRevocationAuthorize: authorize,
    operationalRevocationTargetValidator: validateExternal
  });
  const replica = createProductionRevocationAuthority({
    filePath: join(replicaDir, 'revocations.json'),
    now: () => now().toISOString(),
    replicaMode: true
  });
  const consumer = createProductionControlPlane({
    stateDir: consumerDir,
    accountTenantSeed: data.seed,
    now,
    revocationAuthorityOverride: replica
  });
  const mesh = createBoundedRevocationReplication({
    sourceAuthority: source.revocationAuthority,
    replicas: [{ id: 'region-b', authority: replica }],
    nowMs: () => clock
  });

  return {
    ...data,
    source,
    consumer,
    replica,
    mesh,
    now,
    advance(ms) { clock += ms; },
    issue(input) {
      return source.operationalRevocation.issue({
        actor: ACTOR,
        reasonClass: 'operator_revoked',
        scope: { environment: 'production', targetId: input.targetId },
        ...input
      });
    }
  };
}

function wireCache(pair, { kind, targetId, cacheKey, evaluate }) {
  const cache = createRevocationDecisionCache({
    revocationAuthority: pair.replica,
    onInvalidate: ({ event }) => pair.mesh.noteCacheInvalidated('region-b', event.eventId)
  });
  const decide = () => cache.decide({ kind, targetId, cacheKey, evaluate });
  return { cache, decide };
}

function revokeAcrossPartition(pair, input, cached) {
  const before = cached.decide();
  assert.equal(before.decision.ok, true);
  assert.equal(before.cacheHit, false);
  pair.mesh.partition('region-b');
  const issued = pair.issue(input);
  pair.advance(50);
  const blocked = pair.mesh.replicate('region-b');
  assert.equal(blocked.partitioned, true);
  const stale = cached.decide();
  assert.equal(stale.decision.ok, true, 'partitioned replica must remain on its previous bounded state until heal');
  assert.equal(stale.cacheHit, true);
  const healed = pair.mesh.heal('region-b');
  assert.equal(healed.applied, 1);
  pair.advance(5);
  const denied = cached.decide();
  assert.equal(denied.cacheHit, false, 'replicated event must invalidate the warm decision cache');
  assert.equal(denied.decision.ok, false);
  const timing = pair.mesh.markDenied('region-b', issued.event.eventId);
  assert.equal(timing.appendToReplicaMs, 50);
  assert.equal(timing.appendToInvalidationMs, 50);
  assert.equal(timing.revocationPropagationMs, 55);
  assert.equal(timing.healToDenialMs, 5);
  return { issued, denied, timing };
}

function provisionTrust(control, now, { suffix = '' } = {}) {
  const root = createIdentity();
  const issuer = createIdentity();
  const verifier = createIdentity();
  const sourceOwner = createIdentity();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
  const trust = control.trustAuthority;
  trust.provisionRoot({
    rootId: `root${suffix}`,
    identity: root,
    purposes: ['delegate', 'claim-issuer', 'verifier', 'source-owner'],
    scopes: [
      { kind: 'domain', value: 'example.com', match: 'subdomain' },
      { kind: 'source', value: 'source:', match: 'prefix' }
    ],
    expiresAt
  });
  const rootRef = trust.rootReference(`root${suffix}`);
  const issuerCert = trust.issueCertificate({ identity: root, issuerRef: rootRef, authorityId: `issuer${suffix}`, subject: issuer, purposes: ['claim-issuer'], scopes: [{ kind: 'domain', value: 'finance.example.com' }], expiresAt });
  const verifierCert = trust.issueCertificate({ identity: root, issuerRef: rootRef, authorityId: `verifier${suffix}`, subject: verifier, purposes: ['verifier'], scopes: [{ kind: 'domain', value: 'finance.example.com' }], expiresAt });
  trust.issueCertificate({ identity: root, issuerRef: rootRef, authorityId: `owner${suffix}`, subject: sourceOwner, purposes: ['source-owner'], scopes: [{ kind: 'source', value: 'source:a' }], expiresAt });
  return { root, issuer, verifier, sourceOwner, issuerCert, verifierCert, expiresAt };
}

test('operational revocation validates actor/scope/target and replicas reject gaps but accept exact duplicates', { concurrency: false }, (t) => {
  const pair = makePair(t);
  pair.source.providerGrantAuthority.setProviderPolicy({ providerNodeId: pair.provider.nodeId, mode: 'network' });

  assert.throws(() => pair.source.operationalRevocation.issue({
    kind: 'provider',
    targetId: pair.provider.nodeId,
    actor: ACTOR,
    scope: { environment: 'production', targetId: 'different-provider' }
  }), /operational_revocation_actor_denied/);
  assert.throws(() => pair.source.operationalRevocation.issue({
    kind: 'provider-grant',
    targetId: 'missing-grant',
    actor: ACTOR,
    scope: { environment: 'production', targetId: 'missing-grant' }
  }), /operational_revocation_target_not_applicable/);

  const first = pair.issue({ kind: 'provider', targetId: pair.provider.nodeId });
  assert.equal(first.event.sequence, 1);
  assert.match(first.event.eventHash, /^sha256:/);
  assert.equal(pair.source.revocationAuthority.snapshot().headHash, first.event.eventHash);

  pair.source.providerGrantAuthority.createGrant({
    grantId: 'grant-gap',
    providerNodeId: pair.provider.nodeId,
    subjectType: 'node',
    subjectId: pair.requester.nodeId,
    capabilities: ['secure.cap']
  });
  const second = pair.issue({ kind: 'provider-grant', targetId: 'grant-gap' });
  const isolated = createProductionRevocationAuthority({
    filePath: join(tempDir(t, 'truyn-revoke-gap-'), 'revocations.json'),
    replicaMode: true
  });
  assert.throws(() => isolated.applyReplicatedEvents([second.event]), /revocation_replica_gap/);
  const full = pair.source.revocationAuthority.exportEvents({ afterSequence: 0 });
  assert.equal(isolated.applyReplicatedEvents(full).applied, 2);
  assert.equal(isolated.applyReplicatedEvents(full).applied, 0, 'exact duplicate batch must be idempotent');
  assert.equal(isolated.head().headHash, second.event.eventHash);
});

test('replicated operational revocation invalidates warm decisions and produces actual DENIED for all required consumer classes', { concurrency: false }, async (t) => {
  await t.test('membership', { concurrency: false }, (tt) => {
    const pair = makePair(tt);
    pair.source.providerGrantAuthority.setProviderPolicy({ providerNodeId: pair.provider.nodeId, mode: 'network' });
    pair.consumer.providerGrantAuthority.setProviderPolicy({ providerNodeId: pair.provider.nodeId, mode: 'network' });
    const cached = wireCache(pair, {
      kind: 'membership', targetId: 'm-requester', cacheKey: 'membership-access',
      evaluate: () => pair.consumer.providerGrantAuthority.authorize({ providerNodeId: pair.provider.nodeId, requesterNodeId: pair.requester.nodeId, capability: 'secure.cap' })
    });
    const result = revokeAcrossPartition(pair, { kind: 'membership', targetId: 'm-requester' }, cached);
    assert.equal(result.denied.decision.reason, 'membership_revoked');
    cached.cache.close();
  });

  await t.test('provider-grant', { concurrency: false }, (tt) => {
    const pair = makePair(tt);
    for (const control of [pair.source, pair.consumer]) {
      control.providerGrantAuthority.setProviderPolicy({ providerNodeId: pair.provider.nodeId, mode: 'shared' });
      control.providerGrantAuthority.createGrant({ grantId: 'grant-1', providerNodeId: pair.provider.nodeId, subjectType: 'node', subjectId: pair.requester.nodeId, capabilities: ['secure.cap'] });
    }
    const cached = wireCache(pair, {
      kind: 'provider-grant', targetId: 'grant-1', cacheKey: 'grant-access',
      evaluate: () => pair.consumer.providerGrantAuthority.authorize({ providerNodeId: pair.provider.nodeId, requesterNodeId: pair.requester.nodeId, capability: 'secure.cap' })
    });
    const result = revokeAcrossPartition(pair, { kind: 'provider-grant', targetId: 'grant-1' }, cached);
    assert.equal(result.denied.decision.reason, 'shared_grant_required');
    cached.cache.close();
  });

  await t.test('entitlement', { concurrency: false }, (tt) => {
    const pair = makePair(tt);
    for (const control of [pair.source, pair.consumer]) {
      control.entitlementAuthority.createEntitlement({
        entitlementId: 'ent-1', subjectType: 'node', subjectId: pair.requester.nodeId,
        providerNodeId: pair.provider.nodeId, capabilities: ['secure.cap'], mode: 'subscription', period: 'day', maxRequests: 10, maxTokens: 1000
      });
    }
    const cached = wireCache(pair, {
      kind: 'entitlement', targetId: 'ent-1', cacheKey: 'entitlement-access',
      evaluate: () => pair.consumer.entitlementAuthority.resolve({ requesterNodeId: pair.requester.nodeId, providerNodeId: pair.provider.nodeId, capability: 'secure.cap', mode: 'subscription' })
    });
    const result = revokeAcrossPartition(pair, { kind: 'entitlement', targetId: 'ent-1' }, cached);
    assert.equal(result.denied.decision.reason, 'entitlement_not_found');
    cached.cache.close();
  });

  await t.test('provider', { concurrency: false }, (tt) => {
    const pair = makePair(tt);
    pair.source.providerGrantAuthority.setProviderPolicy({ providerNodeId: pair.provider.nodeId, mode: 'network' });
    pair.consumer.providerGrantAuthority.setProviderPolicy({ providerNodeId: pair.provider.nodeId, mode: 'network' });
    const cached = wireCache(pair, {
      kind: 'provider', targetId: pair.provider.nodeId, cacheKey: 'provider-access',
      evaluate: () => pair.consumer.providerGrantAuthority.authorize({ providerNodeId: pair.provider.nodeId, requesterNodeId: pair.requester.nodeId, capability: 'secure.cap' })
    });
    const result = revokeAcrossPartition(pair, { kind: 'provider', targetId: pair.provider.nodeId }, cached);
    assert.equal(result.denied.decision.reason, 'provider_revoked');
    cached.cache.close();
  });

  await t.test('authority/delegation', { concurrency: false }, (tt) => {
    const pair = makePair(tt);
    const sourceTrust = provisionTrust(pair.source, pair.now(), { suffix: '-shared' });
    const consumerTrust = pair.consumer.trustAuthority;
    consumerTrust.provisionRoot({
      rootId: 'root-shared', identity: sourceTrust.root,
      purposes: ['delegate', 'claim-issuer', 'verifier', 'source-owner'],
      scopes: [{ kind: 'domain', value: 'example.com', match: 'subdomain' }, { kind: 'source', value: 'source:', match: 'prefix' }],
      expiresAt: sourceTrust.expiresAt
    });
    const consumerCert = consumerTrust.issueCertificate({
      identity: sourceTrust.root,
      issuerRef: consumerTrust.rootReference('root-shared'),
      authorityId: 'verifier-shared',
      subject: sourceTrust.verifier,
      purposes: ['verifier'],
      scopes: [{ kind: 'domain', value: 'finance.example.com' }],
      expiresAt: sourceTrust.expiresAt
    });
    assert.equal(consumerCert.certificateId, sourceTrust.verifierCert.certificateId);
    const cached = wireCache(pair, {
      kind: 'delegation', targetId: consumerCert.certificateId, cacheKey: 'delegation-access',
      evaluate: () => pair.consumer.trustAuthority.authorize({ nodeId: sourceTrust.verifier.nodeId, publicKey: sourceTrust.verifier.publicKeyPem, purpose: 'verifier', scope: { kind: 'domain', value: 'finance.example.com' } })
    });
    const result = revokeAcrossPartition(pair, { kind: 'delegation', targetId: consumerCert.certificateId }, cached);
    assert.match(result.denied.decision.reason || '', /revoked|authority/);
    cached.cache.close();
  });

  await t.test('trust-evidence', { concurrency: false }, (tt) => {
    const trustEvidenceIds = new Set();
    const pair = makePair(tt, { trustEvidenceIds });
    const identities = provisionTrust(pair.consumer, pair.now(), { suffix: '-evidence' });
    const claim = createClaim({ identity: identities.issuer, domain: 'finance.example.com', statement: 'Audited revenue was 10 units.' });
    const attestation = createAttestation({
      identity: identities.verifier,
      claim,
      verdict: 'support',
      evidence: [{ kind: 'source', sourceId: 'source:a' }],
      lineage: { originIds: ['origin:a'], publisherIds: ['publisher:a'], generatorIds: [] }
    });
    const lineage = createLineageCertificate({
      identity: identities.sourceOwner,
      sourceId: 'source:a',
      lineage: { originIds: ['origin:a'], publisherIds: ['publisher:a'] },
      expiresAt: identities.expiresAt
    });
    trustEvidenceIds.add(attestation.attestationId);
    const evaluate = () => pair.consumer.assessTrust({ claim, attestations: [attestation], lineageCertificates: [lineage], policy: { minIndependentSupport: 1 } });
    const cached = wireCache(pair, { kind: 'trust-evidence', targetId: attestation.attestationId, cacheKey: 'trust-evidence', evaluate });
    const before = cached.decide();
    assert.equal(before.decision.activeAttestations, 1);
    pair.mesh.partition('region-b');
    const issued = pair.issue({ kind: 'trust-evidence', targetId: attestation.attestationId });
    pair.advance(50);
    assert.equal(pair.mesh.replicate('region-b').partitioned, true);
    assert.equal(cached.decide().decision.activeAttestations, 1);
    assert.equal(pair.mesh.heal('region-b').applied, 1);
    pair.advance(5);
    const denied = cached.decide();
    assert.equal(denied.cacheHit, false);
    assert.equal(denied.decision.activeAttestations, 0);
    assert.equal(denied.decision.revokedAttestations, 1);
    const timing = pair.mesh.markDenied('region-b', issued.event.eventId);
    assert.equal(timing.revocationPropagationMs, 55);
    cached.cache.close();
  });
});

test('real relay performs zero new remote NEED dispatch after replicated provider-grant revocation', { concurrency: false }, async (t) => {
  const pair = makePair(t);
  for (const control of [pair.source, pair.consumer]) {
    control.providerGrantAuthority.setProviderPolicy({ providerNodeId: pair.provider.nodeId, mode: 'shared' });
    control.providerGrantAuthority.createGrant({
      grantId: 'relay-grant', providerNodeId: pair.provider.nodeId, subjectType: 'node', subjectId: pair.requester.nodeId, capabilities: ['secure.cap']
    });
  }
  const restoreRelay = pair.consumer.configureRelay();
  t.after(restoreRelay);
  const relay = createRelay({ allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  const provider = new TruynNode({ relayUrl, identity: pair.provider });
  const requester = new TruynNode({ relayUrl, identity: pair.requester });
  await provider.register();
  await requester.register();
  await provider.offer('secure.cap');

  assert.equal((await requester.need('secure.cap', { prompt: 'before revoke' })).provider, pair.provider.nodeId);
  const dispatchedBeforeRevoke = relay.state.requests.size;
  pair.mesh.partition('region-b');
  pair.issue({ kind: 'provider-grant', targetId: 'relay-grant' });
  pair.advance(50);
  pair.mesh.heal('region-b');

  await assert.rejects(
    requester.need('secure.cap', { prompt: 'after revoke' }),
    (error) => error.status === 404 && error.body?.error === 'no_matching_provider'
  );
  assert.equal(relay.state.requests.size, dispatchedBeforeRevoke, 'revoked request must create zero new remote NEED dispatches');
});
