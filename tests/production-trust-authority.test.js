import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createClaim, createAttestation } from '../core/claims/index.js';
import { createProductionControlPlane } from '../core/security/production-control-plane.js';
import { createAuthorityCertificate } from '../core/trust/authority-certificate.js';
import { assessActiveTrust, createLineageCertificate } from '../core/trust/lifecycle.js';

function stateDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'truyn-production-trust-authority-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function expiry(days = 30) {
  return new Date(Date.now() + days * 24 * 60 * 60_000).toISOString();
}

function provisionGeneralRoot(trust, root) {
  return trust.provisionRoot({
    rootId: 'root-general',
    identity: root,
    purposes: ['delegate', 'claim-issuer', 'verifier', 'source-owner', 'lineage-signer', 'provider-attester', 'disputer'],
    scopes: [
      { kind: 'domain', value: 'example.com', match: 'subdomain' },
      { kind: 'source', value: 'source:', match: 'prefix' },
      { kind: 'provider', value: 'provider:', match: 'prefix' }
    ],
    expiresAt: expiry(365)
  });
}

test('scoped delegation authorizes only delegated domain/source/provider authority', { concurrency: false }, (t) => {
  const dir = stateDir(t);
  const control = createProductionControlPlane({ stateDir: dir });
  const trust = control.trustAuthority;
  const root = createIdentity();
  const verifier = createIdentity();
  const sourceOwner = createIdentity();
  const providerAttester = createIdentity();
  provisionGeneralRoot(trust, root);
  const rootRef = trust.rootReference('root-general');

  trust.issueCertificate({
    identity: root,
    issuerRef: rootRef,
    authorityId: 'finance-verifier',
    subject: verifier,
    purposes: ['verifier'],
    scopes: [{ kind: 'domain', value: 'finance.example.com', match: 'exact' }],
    expiresAt: expiry()
  });
  trust.issueCertificate({
    identity: root,
    issuerRef: rootRef,
    authorityId: 'source-owner-a',
    subject: sourceOwner,
    purposes: ['source-owner'],
    scopes: [{ kind: 'source', value: 'source:a', match: 'exact' }],
    expiresAt: expiry()
  });
  trust.issueCertificate({
    identity: root,
    issuerRef: rootRef,
    authorityId: 'provider-attester-a',
    subject: providerAttester,
    purposes: ['provider-attester'],
    scopes: [{ kind: 'provider', value: 'provider:azure-openai', match: 'exact' }],
    expiresAt: expiry()
  });

  assert.equal(trust.authorize({ nodeId: verifier.nodeId, publicKey: verifier.publicKeyPem, purpose: 'verifier', scope: { kind: 'domain', value: 'finance.example.com' } }).ok, true);
  assert.equal(trust.authorize({ nodeId: verifier.nodeId, publicKey: verifier.publicKeyPem, purpose: 'verifier', scope: { kind: 'domain', value: 'security.example.com' } }).ok, false);
  assert.equal(trust.authorize({ nodeId: sourceOwner.nodeId, publicKey: sourceOwner.publicKeyPem, purpose: 'source-owner', scope: { kind: 'source', value: 'source:a' } }).ok, true);
  assert.equal(trust.authorize({ nodeId: sourceOwner.nodeId, publicKey: sourceOwner.publicKeyPem, purpose: 'source-owner', scope: { kind: 'source', value: 'source:b' } }).ok, false);
  assert.equal(trust.authorize({ nodeId: providerAttester.nodeId, publicKey: providerAttester.publicKeyPem, purpose: 'provider-attester', scope: { kind: 'provider', value: 'provider:azure-openai' } }).ok, true);
  assert.equal(trust.authorize({ nodeId: providerAttester.nodeId, publicKey: providerAttester.publicKeyPem, purpose: 'provider-attester', scope: { kind: 'provider', value: 'provider:google' } }).ok, false);

  assert.throws(() => trust.issueCertificate({
    identity: root,
    issuerRef: rootRef,
    authorityId: 'scope-widening-attempt',
    subject: createIdentity(),
    purposes: ['verifier'],
    scopes: [{ kind: 'domain', value: 'evil.test', match: 'subdomain' }],
    expiresAt: expiry()
  }), /authority_scope_delegation_widened/);
});

test('delegated key rotation is monotonic and supersedes the old key', { concurrency: false }, (t) => {
  const dir = stateDir(t);
  const control = createProductionControlPlane({ stateDir: dir });
  const trust = control.trustAuthority;
  const root = createIdentity();
  const v1 = createIdentity();
  const v2 = createIdentity();
  provisionGeneralRoot(trust, root);
  const rootRef = trust.rootReference('root-general');

  const first = trust.issueCertificate({
    identity: root,
    issuerRef: rootRef,
    authorityId: 'rotating-verifier',
    subject: v1,
    purposes: ['verifier'],
    scopes: [{ kind: 'domain', value: 'finance.example.com' }],
    expiresAt: expiry()
  });
  assert.equal(first.body.authorityVersion, 1);
  assert.equal(trust.authorize({ nodeId: v1.nodeId, purpose: 'verifier', scope: { kind: 'domain', value: 'finance.example.com' } }).ok, true);

  const second = trust.issueCertificate({
    identity: root,
    issuerRef: rootRef,
    authorityId: 'rotating-verifier',
    subject: v2,
    purposes: ['verifier'],
    scopes: [{ kind: 'domain', value: 'finance.example.com' }],
    expiresAt: expiry()
  });
  assert.equal(second.body.authorityVersion, 2);
  assert.equal(second.body.replacesCertificateId, first.certificateId);
  assert.equal(trust.authorize({ nodeId: v1.nodeId, purpose: 'verifier', scope: { kind: 'domain', value: 'finance.example.com' } }).ok, false, 'superseded verifier key must not remain directly authoritative');
  assert.equal(trust.authorize({ nodeId: v2.nodeId, purpose: 'verifier', scope: { kind: 'domain', value: 'finance.example.com' } }).ok, true);

  const stale = createAuthorityCertificate({
    identity: root,
    issuerRef: rootRef,
    authorityId: 'rotating-verifier',
    authorityVersion: 1,
    subject: createIdentity(),
    purposes: ['verifier'],
    scopes: [{ kind: 'domain', value: 'finance.example.com' }],
    expiresAt: expiry()
  });
  assert.throws(() => trust.registerCertificate(stale), /authority_version_rollback_or_gap/);
});

test('root rotation preserves prior delegation until the old root key is emergency-revoked', { concurrency: false }, (t) => {
  const dir = stateDir(t);
  const control = createProductionControlPlane({ stateDir: dir });
  const trust = control.trustAuthority;
  const rootV1 = createIdentity();
  const rootV2 = createIdentity();
  const verifier = createIdentity();
  provisionGeneralRoot(trust, rootV1);
  const rootV1Ref = trust.rootReference('root-general');
  trust.issueCertificate({
    identity: rootV1,
    issuerRef: rootV1Ref,
    authorityId: 'historical-verifier',
    subject: verifier,
    purposes: ['verifier'],
    scopes: [{ kind: 'domain', value: 'finance.example.com' }],
    expiresAt: expiry()
  });

  const rotated = trust.rotateRoot({ rootId: 'root-general', identity: rootV1, subject: rootV2 });
  assert.equal(rotated.version, 2);
  assert.equal(trust.rootReference('root-general').version, 2);
  assert.equal(trust.authorize({ nodeId: rootV1.nodeId, purpose: 'claim-issuer', scope: { kind: 'domain', value: 'finance.example.com' } }).ok, false);
  assert.equal(trust.authorize({ nodeId: rootV2.nodeId, purpose: 'claim-issuer', scope: { kind: 'domain', value: 'finance.example.com' } }).ok, true);
  assert.equal(trust.authorize({ nodeId: verifier.nodeId, purpose: 'verifier', scope: { kind: 'domain', value: 'finance.example.com' } }).ok, true, 'delegation signed by historical root remains valid through proven root rotation');

  trust.emergencyRevokeKey(rootV1.nodeId, { reason: 'root_v1_compromised' });
  assert.equal(trust.authorize({ nodeId: verifier.nodeId, purpose: 'verifier', scope: { kind: 'domain', value: 'finance.example.com' } }).ok, false, 'compromised historical root invalidates delegations chained through it');
});

test('delegation and key revocation are terminal, durable and survive restart', { concurrency: false }, (t) => {
  const dir = stateDir(t);
  const control = createProductionControlPlane({ stateDir: dir });
  const trust = control.trustAuthority;
  const root = createIdentity();
  const verifier = createIdentity();
  provisionGeneralRoot(trust, root);
  trust.issueCertificate({
    identity: root,
    issuerRef: trust.rootReference('root-general'),
    authorityId: 'revocable-verifier',
    subject: verifier,
    purposes: ['verifier'],
    scopes: [{ kind: 'domain', value: 'finance.example.com' }],
    expiresAt: expiry()
  });
  assert.equal(trust.authorize({ nodeId: verifier.nodeId, purpose: 'verifier', scope: { kind: 'domain', value: 'finance.example.com' } }).ok, true);

  trust.revokeDelegation('revocable-verifier', { reason: 'delegation_removed' });
  assert.equal(trust.authorize({ nodeId: verifier.nodeId, purpose: 'verifier', scope: { kind: 'domain', value: 'finance.example.com' } }).ok, false);

  const restarted = createProductionControlPlane({ stateDir: dir });
  assert.equal(restarted.trustAuthority.authorize({ nodeId: verifier.nodeId, purpose: 'verifier', scope: { kind: 'domain', value: 'finance.example.com' } }).ok, false);
  assert.equal(restarted.revocationAuthority.isRevoked('authority-certificate', trust.snapshot().currentAuthorities['revocable-verifier']), true);

  const second = createIdentity();
  restarted.trustAuthority.issueCertificate({
    identity: root,
    issuerRef: restarted.trustAuthority.rootReference('root-general'),
    authorityId: 'second-verifier',
    subject: second,
    purposes: ['verifier'],
    scopes: [{ kind: 'domain', value: 'finance.example.com' }],
    expiresAt: expiry()
  });
  restarted.trustAuthority.emergencyRevokeKey(second.nodeId);
  const restartedAgain = createProductionControlPlane({ stateDir: dir });
  assert.equal(restartedAgain.revocationAuthority.isRevoked('authority-key', second.nodeId), true);
  assert.equal(restartedAgain.trustAuthority.authorize({ nodeId: second.nodeId, purpose: 'verifier', scope: { kind: 'domain', value: 'finance.example.com' } }).ok, false);
});

test('active Trustability requires authoritative claim issuer, verifier and source owner when production registry is supplied', { concurrency: false }, (t) => {
  const dir = stateDir(t);
  const control = createProductionControlPlane({ stateDir: dir });
  const trust = control.trustAuthority;
  const root = createIdentity();
  const issuer = createIdentity();
  const verifier = createIdentity();
  const sourceOwner = createIdentity();
  provisionGeneralRoot(trust, root);
  const rootRef = trust.rootReference('root-general');
  trust.issueCertificate({ identity: root, issuerRef: rootRef, authorityId: 'issuer-finance', subject: issuer, purposes: ['claim-issuer'], scopes: [{ kind: 'domain', value: 'finance.example.com' }], expiresAt: expiry() });
  trust.issueCertificate({ identity: root, issuerRef: rootRef, authorityId: 'verifier-finance', subject: verifier, purposes: ['verifier'], scopes: [{ kind: 'domain', value: 'finance.example.com' }], expiresAt: expiry() });
  trust.issueCertificate({ identity: root, issuerRef: rootRef, authorityId: 'owner-source-a', subject: sourceOwner, purposes: ['source-owner'], scopes: [{ kind: 'source', value: 'source:a' }], expiresAt: expiry() });

  const claim = createClaim({ identity: issuer, domain: 'finance.example.com', statement: 'Audited revenue was 10 units.' });
  const attestation = createAttestation({
    identity: verifier,
    claim,
    verdict: 'support',
    evidence: [{ kind: 'source', sourceId: 'source:a' }],
    lineage: { originIds: ['origin:a'], publisherIds: ['publisher:a'], generatorIds: [] }
  });
  const lineage = createLineageCertificate({
    identity: sourceOwner,
    sourceId: 'source:a',
    lineage: { originIds: ['origin:a'], publisherIds: ['publisher:a'] },
    expiresAt: expiry()
  });

  let assessment = assessActiveTrust({
    claim,
    attestations: [attestation],
    lineageCertificates: [lineage],
    authorityRegistry: trust,
    policy: { minIndependentSupport: 1 }
  });
  assert.equal(assessment.activeAttestations, 1);
  assert.equal(assessment.unauthorizedAttestations, 0);
  assert.ok(assessment.productionAuthority?.authorityEpoch >= 4);
  assert.match(assessment.productionAuthority?.headHash || '', /^sha256:/);

  trust.emergencyRevokeKey(verifier.nodeId, { reason: 'verifier_compromised' });
  assessment = assessActiveTrust({ claim, attestations: [attestation], lineageCertificates: [lineage], authorityRegistry: trust, policy: { minIndependentSupport: 1 } });
  assert.equal(assessment.activeAttestations, 0);
  assert.equal(assessment.unauthorizedAttestations, 1);
  assert.equal(assessment.lifecycleStatus, 'stale_or_uncertified');

  const foreignIssuer = createIdentity();
  const foreignClaim = createClaim({ identity: foreignIssuer, domain: 'finance.example.com', statement: 'Unauthorized issuer statement.' });
  const denied = assessActiveTrust({ claim: foreignClaim, authorityRegistry: trust });
  assert.equal(denied.lifecycleStatus, 'authority_untrusted');
  assert.equal(denied.truthAssessment.status, 'authority_untrusted');
});

test('authority anchor detects registry rollback when the anchor remains current', { concurrency: false }, (t) => {
  const dir = stateDir(t);
  const control = createProductionControlPlane({ stateDir: dir });
  const trust = control.trustAuthority;
  const root = createIdentity();
  provisionGeneralRoot(trust, root);
  const oldSnapshot = trust.snapshot();
  trust.issueCertificate({
    identity: root,
    issuerRef: trust.rootReference('root-general'),
    authorityId: 'post-anchor-verifier',
    subject: createIdentity(),
    purposes: ['verifier'],
    scopes: [{ kind: 'domain', value: 'finance.example.com' }],
    expiresAt: expiry()
  });
  const currentHead = trust.head();
  assert.ok(currentHead.authorityEpoch > oldSnapshot.authorityEpoch);

  writeFileSync(join(dir, 'trust-authority.json'), `${JSON.stringify(oldSnapshot, null, 2)}\n`, 'utf8');
  assert.throws(() => createProductionControlPlane({ stateDir: dir }), /authority_state_rollback_detected/);
});
