import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createClaim } from '../core/claims/index.js';
import { createProductionControlPlane } from '../core/security/production-control-plane.js';
import { createAuthorityCertificate, normalizeAuthorityScope } from '../core/trust/authority-certificate.js';
import { assessActiveTrust, createDispute, createTrustRevocation } from '../core/trust/lifecycle.js';
import { ActiveTrustCoordinator } from '../node/active-trust-network.js';

function stateDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'truyn-production-trust-review-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function expiresFrom(ms, days = 30) {
  return new Date(ms + days * 24 * 60 * 60_000).toISOString();
}

function provisionRoot(trust, identity, rootId, nowMs, purposes = ['delegate', 'claim-issuer', 'verifier', 'disputer']) {
  return trust.provisionRoot({
    rootId,
    identity,
    purposes,
    scopes: [{ kind: 'domain', value: 'example.com', match: 'subdomain' }],
    notBefore: new Date(nowMs).toISOString(),
    expiresAt: expiresFrom(nowMs, 365)
  });
}

test('domain scope normalization rejects dot-only prefixes', () => {
  assert.throws(() => normalizeAuthorityScope({ kind: 'domain', value: '....', match: 'prefix' }), /empty after domain normalization/);
});

test('expired roots cannot rotate themselves back into authority', { concurrency: false }, (t) => {
  const dir = stateDir(t);
  let clock = Date.parse('2035-01-01T00:00:00.000Z');
  const control = createProductionControlPlane({ stateDir: dir, now: () => new Date(clock) });
  const root = createIdentity();
  const replacement = createIdentity();
  control.trustAuthority.provisionRoot({
    rootId: 'short-root', identity: root,
    purposes: ['delegate', 'claim-issuer'],
    scopes: [{ kind: 'domain', value: 'example.com', match: 'subdomain' }],
    notBefore: new Date(clock).toISOString(),
    expiresAt: new Date(clock + 1_000).toISOString()
  });
  clock += 2_000;
  assert.throws(() => control.trustAuthority.rotateRoot({ rootId: 'short-root', identity: root, subject: replacement }), /authority_root_rotation_signer_not_current/);
});

test('superseded roots cannot mint a backdated certificate after rotation', { concurrency: false }, (t) => {
  const dir = stateDir(t);
  let clock = Date.parse('2035-02-01T00:00:00.000Z');
  const control = createProductionControlPlane({ stateDir: dir, now: () => new Date(clock) });
  const trust = control.trustAuthority;
  const rootV1 = createIdentity();
  const rootV2 = createIdentity();
  const subject = createIdentity();
  provisionRoot(trust, rootV1, 'root-a', clock);
  const oldRef = trust.rootReference('root-a');
  const backdated = new Date(clock).toISOString();
  clock += 1_000;
  trust.rotateRoot({ rootId: 'root-a', identity: rootV1, subject: rootV2 });
  const certificate = createAuthorityCertificate({
    identity: rootV1,
    issuerRef: oldRef,
    authorityId: 'backdated-after-rotation',
    authorityVersion: 1,
    subject,
    purposes: ['verifier'],
    scopes: [{ kind: 'domain', value: 'api.example.com', match: 'exact' }],
    issuedAt: backdated,
    notBefore: backdated,
    expiresAt: expiresFrom(clock)
  });
  assert.throws(() => trust.registerCertificate(certificate), /authority_issuer_root_superseded/);
});

test('delegated authority rotation requires issuer continuity', { concurrency: false }, (t) => {
  const dir = stateDir(t);
  const clock = Date.parse('2035-03-01T00:00:00.000Z');
  const control = createProductionControlPlane({ stateDir: dir, now: () => new Date(clock) });
  const trust = control.trustAuthority;
  const rootA = createIdentity();
  const rootB = createIdentity();
  provisionRoot(trust, rootA, 'root-a', clock);
  provisionRoot(trust, rootB, 'root-b', clock);
  trust.issueCertificate({ identity: rootA, issuerRef: trust.rootReference('root-a'), authorityId: 'owned-authority', subject: createIdentity(), purposes: ['verifier'], scopes: [{ kind: 'domain', value: 'api.example.com' }], expiresAt: expiresFrom(clock) });
  assert.throws(() => trust.issueCertificate({ identity: rootB, issuerRef: trust.rootReference('root-b'), authorityId: 'owned-authority', subject: createIdentity(), purposes: ['verifier'], scopes: [{ kind: 'domain', value: 'api.example.com' }], expiresAt: expiresFrom(clock) }), /authority_rotation_issuer_continuity_required/);
});

test('authorization continues after an invalid logical authority candidate for the same node', { concurrency: false }, (t) => {
  const dir = stateDir(t);
  const clock = Date.parse('2035-04-01T00:00:00.000Z');
  const control = createProductionControlPlane({ stateDir: dir, now: () => new Date(clock) });
  const trust = control.trustAuthority;
  const root = createIdentity();
  const verifier = createIdentity();
  provisionRoot(trust, root, 'root-a', clock);
  const ref = trust.rootReference('root-a');
  const first = trust.issueCertificate({ identity: root, issuerRef: ref, authorityId: 'scope-one', subject: verifier, purposes: ['verifier'], scopes: [{ kind: 'domain', value: 'api.example.com' }], expiresAt: expiresFrom(clock) });
  trust.issueCertificate({ identity: root, issuerRef: ref, authorityId: 'scope-two', subject: verifier, purposes: ['verifier'], scopes: [{ kind: 'domain', value: 'api.example.com' }], expiresAt: expiresFrom(clock) });
  trust.revokeCertificate(first.certificateId);
  const authorized = trust.authorize({ nodeId: verifier.nodeId, publicKey: verifier.publicKeyPem, purpose: 'verifier', scope: { kind: 'domain', value: 'api.example.com' } });
  assert.equal(authorized.ok, true);
  assert.equal(authorized.authorityId, 'scope-two');
});

test('authority revocation removal is detected independently of registry rollback', { concurrency: false }, (t) => {
  const dir = stateDir(t);
  const clock = Date.parse('2035-05-01T00:00:00.000Z');
  const control = createProductionControlPlane({ stateDir: dir, now: () => new Date(clock) });
  const trust = control.trustAuthority;
  const root = createIdentity();
  const verifier = createIdentity();
  provisionRoot(trust, root, 'root-a', clock);
  trust.issueCertificate({ identity: root, issuerRef: trust.rootReference('root-a'), authorityId: 'revocable', subject: verifier, purposes: ['verifier'], scopes: [{ kind: 'domain', value: 'api.example.com' }], expiresAt: expiresFrom(clock) });
  const preRevocation = control.revocationAuthority.snapshot();
  trust.revokeDelegation('revocable');
  writeFileSync(join(dir, 'revocations.json'), `${JSON.stringify(preRevocation, null, 2)}\n`, 'utf8');
  assert.throws(() => createProductionControlPlane({ stateDir: dir, now: () => new Date(clock) }), /authority_revocation_rollback_detected/);
});

test('registry record tampering is bound to the anchored state commitment', { concurrency: false }, (t) => {
  const dir = stateDir(t);
  const clock = Date.parse('2035-06-01T00:00:00.000Z');
  const control = createProductionControlPlane({ stateDir: dir, now: () => new Date(clock) });
  const root = createIdentity();
  provisionRoot(control.trustAuthority, root, 'root-a', clock);
  const path = join(dir, 'trust-authority.json');
  const state = JSON.parse(readFileSync(path, 'utf8'));
  state.roots['root-a'].versions['1'].nodeId = createIdentity().nodeId;
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  assert.throws(() => createProductionControlPlane({ stateDir: dir, now: () => new Date(clock) }), /authority_state_commitment_invalid/);
});

test('production disputes ignore the legacy disputer allowlist unless registry authority exists', { concurrency: false }, (t) => {
  const dir = stateDir(t);
  const clock = Date.parse('2035-07-01T00:00:00.000Z');
  const control = createProductionControlPlane({ stateDir: dir, now: () => new Date(clock) });
  const root = createIdentity();
  const foreignDisputer = createIdentity();
  provisionRoot(control.trustAuthority, root, 'root-a', clock);
  const claim = createClaim({ identity: root, domain: 'api.example.com', statement: 'Registry-authorized claim.' });
  const dispute = createDispute({ identity: foreignDisputer, claim, groundsDigest: 'sha256:review-regression' });
  const assessment = assessActiveTrust({ claim, disputes: [dispute], authorizedDisputerNodeIds: [foreignDisputer.nodeId], authorityRegistry: control.trustAuthority, now: clock });
  assert.equal(assessment.activeDisputes, 0);
  assert.notEqual(assessment.lifecycleStatus, 'disputed');
});

test('signed claim revocation remains terminal even after issuer authority is revoked', { concurrency: false }, (t) => {
  const dir = stateDir(t);
  const clock = Date.parse('2035-08-01T00:00:00.000Z');
  const control = createProductionControlPlane({ stateDir: dir, now: () => new Date(clock) });
  const root = createIdentity();
  provisionRoot(control.trustAuthority, root, 'root-a', clock);
  const claim = createClaim({ identity: root, domain: 'api.example.com', statement: 'Terminally revoked claim.' });
  const revocation = createTrustRevocation({ identity: root, targetType: 'claim', targetId: claim.claimId, revokedAt: new Date(clock).toISOString() });
  control.trustAuthority.emergencyRevokeKey(root.nodeId);
  const assessment = assessActiveTrust({ claim, revocations: [revocation], authorityRegistry: control.trustAuthority, now: clock });
  assert.equal(assessment.lifecycleStatus, 'revoked');
  assert.equal(assessment.truthAssessment.reason, 'claim_revoked');
});

test('pinned authority views remain stable across later rotation', { concurrency: false }, (t) => {
  const dir = stateDir(t);
  let clock = Date.parse('2035-09-01T00:00:00.000Z');
  const control = createProductionControlPlane({ stateDir: dir, now: () => new Date(clock) });
  const rootV1 = createIdentity();
  const rootV2 = createIdentity();
  provisionRoot(control.trustAuthority, rootV1, 'root-a', clock);
  const pinned = control.trustAuthority.pin();
  const pinnedHead = pinned.head();
  clock += 1_000;
  control.trustAuthority.rotateRoot({ rootId: 'root-a', identity: rootV1, subject: rootV2 });
  assert.equal(control.trustAuthority.authorize({ nodeId: rootV1.nodeId, purpose: 'claim-issuer', scope: { kind: 'domain', value: 'api.example.com' }, at: clock }).ok, false);
  assert.equal(pinned.authorize({ nodeId: rootV1.nodeId, purpose: 'claim-issuer', scope: { kind: 'domain', value: 'api.example.com' }, at: clock }).ok, true);
  assert.equal(pinned.head().headHash, pinnedHead.headHash);
  assert.notEqual(control.trustAuthority.head().headHash, pinnedHead.headHash);
});

test('active network coordinator carries production authority registry into challenge assessments', () => {
  const node = { identity: createIdentity() };
  const authorityRegistry = { authorize: () => ({ ok: false }) };
  const coordinator = new ActiveTrustCoordinator({ node, authorityRegistry });
  assert.equal(coordinator.authorityRegistry, authorityRegistry);
  const source = readFileSync(new URL('../node/active-trust-network.js', import.meta.url), 'utf8');
  assert.match(source, /authorityRegistry = this\.authorityRegistry/);
  assert.match(source, /authorizedDisputerNodeIds,\n\s+authorityRegistry,/);
});
