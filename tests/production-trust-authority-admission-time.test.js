import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createProductionControlPlane } from '../core/security/production-control-plane.js';

function stateDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'truyn-authority-admission-time-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('historical authorization cannot predate root or delegation registry admission', { concurrency: false }, (t) => {
  const admittedAt = '2038-06-10T00:00:00.000Z';
  const control = createProductionControlPlane({
    stateDir: stateDir(t),
    now: () => new Date(admittedAt)
  });
  const trust = control.trustAuthority;
  const root = createIdentity();
  const verifier = createIdentity();
  const scope = { kind: 'domain', value: 'finance.example.com', match: 'exact' };

  trust.provisionRoot({
    rootId: 'backdated-root',
    identity: root,
    purposes: ['delegate', 'verifier'],
    scopes: [scope],
    notBefore: '2038-01-01T00:00:00.000Z',
    expiresAt: '2039-01-01T00:00:00.000Z'
  });

  assert.equal(trust.authorize({
    nodeId: root.nodeId,
    publicKey: root.publicKeyPem,
    purpose: 'verifier',
    scope,
    at: '2038-06-01T00:00:00.000Z'
  }).ok, false, 'a backdated root must not authorize evidence created before registry admission');

  assert.equal(trust.authorize({
    nodeId: root.nodeId,
    publicKey: root.publicKeyPem,
    purpose: 'verifier',
    scope,
    at: admittedAt
  }).ok, true);

  trust.issueCertificate({
    identity: root,
    issuerRef: trust.rootReference('backdated-root'),
    authorityId: 'backdated-verifier',
    subject: verifier,
    purposes: ['verifier'],
    scopes: [scope],
    issuedAt: '2038-02-01T00:00:00.000Z',
    notBefore: '2038-02-01T00:00:00.000Z',
    expiresAt: '2039-01-01T00:00:00.000Z'
  });

  assert.equal(trust.authorize({
    nodeId: verifier.nodeId,
    publicKey: verifier.publicKeyPem,
    purpose: 'verifier',
    scope,
    at: '2038-06-05T00:00:00.000Z'
  }).ok, false, 'a backdated delegation must not authorize evidence created before certificate admission');

  assert.equal(trust.authorize({
    nodeId: verifier.nodeId,
    publicKey: verifier.publicKeyPem,
    purpose: 'verifier',
    scope,
    at: admittedAt
  }).ok, true);
});
