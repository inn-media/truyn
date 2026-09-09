import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createClaim, createAttestation } from '../core/claims/index.js';
import { createProductionControlPlane } from '../core/security/production-control-plane.js';
import { assessActiveTrust, createLineageCertificate } from '../core/trust/lifecycle.js';
import { ActiveTrustCoordinator } from '../node/active-trust-network.js';

function stateDir(t, prefix = 'truyn-production-trust-security-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function equivalentPem(pem) {
  return `${pem.trim().replace(/\r?\n/g, '\r\n')}\r\n`;
}

function equivalentIdentity(identity) {
  return { ...identity, publicKeyPem: equivalentPem(identity.publicKeyPem) };
}

function expiresFrom(clock, days = 30) {
  return new Date(clock + days * 24 * 60 * 60_000).toISOString();
}

test('canonical public-key material authorizes across roots, delegations, claims, attestations and lineage while mismatched keys deny', { concurrency: false }, (t) => {
  const dir = stateDir(t);
  const clock = Date.parse('2036-01-01T00:00:00.000Z');
  const control = createProductionControlPlane({ stateDir: dir, now: () => new Date(clock) });
  const trust = control.trustAuthority;
  const root = createIdentity();
  const issuer = createIdentity();
  const verifier = createIdentity();
  const sourceOwner = createIdentity();
  const expiresAt = expiresFrom(clock, 365);

  trust.provisionRoot({
    rootId: 'root-canonical-key',
    identity: root,
    purposes: ['delegate', 'claim-issuer', 'verifier', 'source-owner', 'lineage-signer'],
    scopes: [
      { kind: 'domain', value: 'example.com', match: 'subdomain' },
      { kind: 'source', value: 'source:', match: 'prefix' }
    ],
    notBefore: new Date(clock).toISOString(),
    expiresAt
  });
  const rootRef = trust.rootReference('root-canonical-key');
  const rootEquivalent = equivalentIdentity(root);

  // Equivalent issuer PEM must match the already-provisioned root material.
  trust.issueCertificate({
    identity: rootEquivalent,
    issuerRef: rootRef,
    authorityId: 'canonical-issuer',
    subject: equivalentIdentity(issuer),
    purposes: ['claim-issuer'],
    scopes: [{ kind: 'domain', value: 'finance.example.com' }],
    issuedAt: new Date(clock).toISOString(),
    notBefore: new Date(clock).toISOString(),
    expiresAt
  });
  trust.issueCertificate({
    identity: rootEquivalent,
    issuerRef: rootRef,
    authorityId: 'canonical-verifier',
    subject: verifier,
    purposes: ['verifier'],
    scopes: [{ kind: 'domain', value: 'finance.example.com' }],
    issuedAt: new Date(clock).toISOString(),
    notBefore: new Date(clock).toISOString(),
    expiresAt
  });
  trust.issueCertificate({
    identity: rootEquivalent,
    issuerRef: rootRef,
    authorityId: 'canonical-source-owner',
    subject: sourceOwner,
    purposes: ['source-owner'],
    scopes: [{ kind: 'source', value: 'source:a' }],
    issuedAt: new Date(clock).toISOString(),
    notBefore: new Date(clock).toISOString(),
    expiresAt
  });

  assert.equal(trust.authorize({
    nodeId: issuer.nodeId,
    publicKey: issuer.publicKeyPem,
    purpose: 'claim-issuer',
    scope: { kind: 'domain', value: 'finance.example.com' },
    at: clock
  }).ok, true, 'same issuer key material in a different PEM representation must authorize');

  assert.equal(trust.authorize({
    nodeId: verifier.nodeId,
    publicKey: equivalentPem(verifier.publicKeyPem),
    purpose: 'verifier',
    scope: { kind: 'domain', value: 'finance.example.com' },
    at: clock
  }).ok, true, 'same verifier key material in a different PEM representation must authorize');

  assert.equal(trust.authorize({
    nodeId: verifier.nodeId,
    publicKey: equivalentPem(verifier.publicKeyPem),
    purpose: 'claim-issuer',
    scope: { kind: 'domain', value: 'finance.example.com' },
    at: clock
  }).ok, false, 'canonical key equivalence must not bypass purpose constraints');

  assert.equal(trust.authorize({
    nodeId: verifier.nodeId,
    publicKey: createIdentity().publicKeyPem,
    purpose: 'verifier',
    scope: { kind: 'domain', value: 'finance.example.com' },
    at: clock
  }).ok, false, 'different key material must remain denied');

  const createdAt = new Date(clock).toISOString();
  const claim = createClaim({
    identity: issuer,
    domain: 'finance.example.com',
    statement: 'Canonical key regression claim.',
    createdAt
  });
  const attestation = createAttestation({
    identity: equivalentIdentity(verifier),
    claim,
    verdict: 'support',
    evidence: [{ kind: 'source', sourceId: 'source:a' }],
    lineage: { originIds: ['origin:a'], publisherIds: ['publisher:a'], generatorIds: [] },
    createdAt
  });
  const lineage = createLineageCertificate({
    identity: equivalentIdentity(sourceOwner),
    sourceId: 'source:a',
    lineage: { originIds: ['origin:a'], publisherIds: ['publisher:a'] },
    issuedAt: createdAt,
    expiresAt
  });

  const assessment = assessActiveTrust({
    claim,
    attestations: [attestation],
    lineageCertificates: [lineage],
    authorityRegistry: trust,
    policy: { minIndependentSupport: 1 },
    now: clock
  });
  assert.equal(assessment.activeAttestations, 1);
  assert.equal(assessment.unauthorizedAttestations, 0);
  assert.notEqual(assessment.lifecycleStatus, 'authority_untrusted');

  const replacement = createIdentity();
  const rotated = trust.rotateRoot({
    rootId: 'root-canonical-key',
    identity: rootEquivalent,
    subject: replacement,
    issuedAt: createdAt,
    notBefore: createdAt,
    expiresAt
  });
  assert.equal(rotated.version, 2, 'equivalent root signer PEM must be accepted as the same root key material');
});

test('ActiveTrustCoordinator functionally forwards its production registry and rejects an unknown claim issuer', { concurrency: false }, async (t) => {
  const dir = stateDir(t, 'truyn-active-trust-registry-');
  const clock = Date.parse('2036-02-01T00:00:00.000Z');
  const control = createProductionControlPlane({ stateDir: dir, now: () => new Date(clock) });
  const root = createIdentity();
  control.trustAuthority.provisionRoot({
    rootId: 'coordinator-root',
    identity: root,
    purposes: ['delegate', 'claim-issuer'],
    scopes: [{ kind: 'domain', value: 'example.com', match: 'subdomain' }],
    notBefore: new Date(clock).toISOString(),
    expiresAt: expiresFrom(clock, 365)
  });

  const node = {
    identity: createIdentity(),
    sessionToken: null,
    async register() {
      this.sessionToken = 'test-session';
      return { ok: true, nodeId: this.identity.nodeId };
    },
    async find() {
      return { offers: [] };
    },
    async poll() {
      return { events: [] };
    }
  };
  const coordinator = new ActiveTrustCoordinator({ node, authorityRegistry: control.trustAuthority });
  const foreignIssuer = createIdentity();
  const claim = createClaim({
    identity: foreignIssuer,
    domain: 'finance.example.com',
    statement: 'Unknown production issuer.',
    createdAt: new Date(clock).toISOString()
  });
  const result = await coordinator.challenge({ claim, now: clock });
  assert.equal(result.authorizedVerifierCount, 0);
  assert.equal(result.assessment.lifecycleStatus, 'authority_untrusted');
  assert.equal(result.assessment.truthAssessment.status, 'authority_untrusted');
});

test('corrupt production trust registry fails closed on restart', { concurrency: false }, (t) => {
  const dir = stateDir(t, 'truyn-corrupt-trust-state-');
  const clock = Date.parse('2036-03-01T00:00:00.000Z');
  const control = createProductionControlPlane({ stateDir: dir, now: () => new Date(clock) });
  const root = createIdentity();
  control.trustAuthority.provisionRoot({
    rootId: 'corrupt-root',
    identity: root,
    purposes: ['claim-issuer'],
    scopes: [{ kind: 'domain', value: 'example.com', match: 'subdomain' }],
    notBefore: new Date(clock).toISOString(),
    expiresAt: expiresFrom(clock, 365)
  });
  writeFileSync(join(dir, 'trust-authority.json'), '{"version":', 'utf8');
  assert.throws(() => createProductionControlPlane({ stateDir: dir, now: () => new Date(clock) }), /durable_state_corrupt/);
});

test('partial restore cannot drop anchored authority or terminal revocation state', { concurrency: false }, (t) => {
  const clock = Date.parse('2036-04-01T00:00:00.000Z');

  const missingRegistryDir = stateDir(t, 'truyn-missing-trust-state-');
  const first = createProductionControlPlane({ stateDir: missingRegistryDir, now: () => new Date(clock) });
  const root = createIdentity();
  first.trustAuthority.provisionRoot({
    rootId: 'partial-root',
    identity: root,
    purposes: ['delegate', 'verifier'],
    scopes: [{ kind: 'domain', value: 'example.com', match: 'subdomain' }],
    notBefore: new Date(clock).toISOString(),
    expiresAt: expiresFrom(clock, 365)
  });
  unlinkSync(join(missingRegistryDir, 'trust-authority.json'));
  assert.throws(
    () => createProductionControlPlane({ stateDir: missingRegistryDir, now: () => new Date(clock) }),
    /authority_state_rollback_detected|authority_state_head_mismatch|authority_state_anchor_commitment_mismatch/
  );

  const missingRevocationDir = stateDir(t, 'truyn-missing-revocation-state-');
  const second = createProductionControlPlane({ stateDir: missingRevocationDir, now: () => new Date(clock) });
  const root2 = createIdentity();
  const verifier = createIdentity();
  second.trustAuthority.provisionRoot({
    rootId: 'revocation-root',
    identity: root2,
    purposes: ['delegate', 'verifier'],
    scopes: [{ kind: 'domain', value: 'example.com', match: 'subdomain' }],
    notBefore: new Date(clock).toISOString(),
    expiresAt: expiresFrom(clock, 365)
  });
  second.trustAuthority.issueCertificate({
    identity: root2,
    issuerRef: second.trustAuthority.rootReference('revocation-root'),
    authorityId: 'terminal-verifier',
    subject: verifier,
    purposes: ['verifier'],
    scopes: [{ kind: 'domain', value: 'finance.example.com' }],
    issuedAt: new Date(clock).toISOString(),
    notBefore: new Date(clock).toISOString(),
    expiresAt: expiresFrom(clock, 30)
  });
  second.trustAuthority.emergencyRevokeKey(verifier.nodeId, { reason: 'terminal_regression' });
  unlinkSync(join(missingRevocationDir, 'revocations.json'));
  assert.throws(
    () => createProductionControlPlane({ stateDir: missingRevocationDir, now: () => new Date(clock) }),
    /authority_revocation_rollback_detected/
  );
});
