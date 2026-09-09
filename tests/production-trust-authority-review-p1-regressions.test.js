import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createProductionControlPlane } from '../core/security/production-control-plane.js';
import {
  materializeProductionControlPlaneSnapshot
} from '../core/security/production-control-plane-snapshot.js';
import { createProductionRevocationAuthority } from '../core/security/production-revocation-authority.js';
import { createRevocationDecisionCache } from '../core/security/operational-revocation.js';

function tempDir(t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('terminal revocation materialization must match the verified event log', { concurrency: false }, (t) => {
  const dir = tempDir(t, 'truyn-revocation-map-log-');
  const path = join(dir, 'revocations.json');
  const authority = createProductionRevocationAuthority({
    filePath: path,
    now: () => '2038-01-01T00:00:00.000Z'
  });

  authority.revoke('provider', 'provider-a', { reason: 'compromised' });
  const state = readJson(path);
  assert.equal(state.events.length, 1);
  assert.ok(state.revocations['provider:provider-a']);

  delete state.revocations['provider:provider-a'];
  writeJson(path, state);

  assert.throws(() => createProductionRevocationAuthority({ filePath: path }), /revocation_materialized_log_mismatch/);
});

test('snapshot materialization preserves trust registry and independent anchor', { concurrency: false }, (t) => {
  const sourceDir = tempDir(t, 'truyn-trust-snapshot-source-');
  const restoredDir = tempDir(t, 'truyn-trust-snapshot-restored-');
  const clock = new Date('2038-02-01T00:00:00.000Z');
  const control = createProductionControlPlane({ stateDir: sourceDir, now: () => new Date(clock) });
  const root = createIdentity();

  control.trustAuthority.provisionRoot({
    rootId: 'snapshot-root',
    identity: root,
    purposes: ['claim-issuer'],
    scopes: [{ kind: 'domain', value: 'example.com', match: 'subdomain' }],
    expiresAt: '2039-02-01T00:00:00.000Z'
  });

  materializeProductionControlPlaneSnapshot({ snapshot: control.snapshot(), stateDir: restoredDir });
  assert.equal(existsSync(join(restoredDir, 'trust-authority.json')), true);
  assert.equal(existsSync(join(restoredDir, 'trust-authority.anchor.json')), true);

  const restored = createProductionControlPlane({ stateDir: restoredDir, now: () => new Date(clock) });
  assert.deepEqual(restored.trustAuthority.rootReference('snapshot-root'), { type: 'root', id: 'snapshot-root', version: 1 });
});

test('operational authority revocation advances trust anti-rollback anchor', { concurrency: false }, (t) => {
  const dir = tempDir(t, 'truyn-operational-anchor-');
  const clock = new Date('2038-03-01T00:00:00.000Z');
  const control = createProductionControlPlane({
    stateDir: dir,
    now: () => new Date(clock),
    operationalRevocationAuthorize: () => ({ ok: true })
  });
  const root = createIdentity();
  control.trustAuthority.provisionRoot({
    rootId: 'operational-root',
    identity: root,
    purposes: ['claim-issuer'],
    scopes: [{ kind: 'domain', value: 'example.com', match: 'subdomain' }],
    expiresAt: '2039-03-01T00:00:00.000Z'
  });

  const revocationPath = join(dir, 'revocations.json');
  writeJson(revocationPath, control.revocationAuthority.snapshot());
  const preRevocationState = readFileSync(revocationPath, 'utf8');
  const beforeAnchor = control.trustAuthority.anchorSnapshot();

  const issued = control.operationalRevocation.issue({
    kind: 'authority',
    targetKind: 'authority-root',
    targetId: 'operational-root',
    actor: { authorityId: 'ops-root', keyId: 'ops-key' },
    reasonClass: 'root_compromised'
  });
  assert.equal(issued.created, true);

  const afterAnchor = control.trustAuthority.anchorSnapshot();
  assert.ok(afterAnchor.minimumAuthorityEpoch > beforeAnchor.minimumAuthorityEpoch);
  assert.ok(afterAnchor.revokedAuthorityTargets.includes('authority-root:operational-root'));

  writeFileSync(revocationPath, preRevocationState, 'utf8');
  assert.throws(
    () => createProductionControlPlane({ stateDir: dir, now: () => new Date(clock) }),
    /authority_revocation_rollback_detected/
  );
});

test('decision cache invalidates stale allow when any dependent revocation kind advances', { concurrency: false }, (t) => {
  const dir = tempDir(t, 'truyn-revocation-global-epoch-');
  const authority = createProductionRevocationAuthority({
    filePath: join(dir, 'revocations.json'),
    now: () => '2038-04-01T00:00:00.000Z'
  });
  const cache = createRevocationDecisionCache({ revocationAuthority: authority });
  t.after(() => cache.close());

  const decide = () => cache.decide({
    kind: 'provider-grant',
    targetId: 'grant-a',
    cacheKey: 'requester-a:provider-a:grant-a',
    evaluate: () => ({ ok: !authority.isRevoked('membership', 'membership-a') })
  });

  const first = decide();
  assert.equal(first.cacheHit, false);
  assert.equal(first.decision.ok, true);
  assert.equal(decide().cacheHit, true);

  authority.revoke('membership', 'membership-a', { reason: 'membership_revoked' });
  const after = decide();
  assert.equal(after.cacheHit, false, 'membership revocation must invalidate a cached provider-grant allow');
  assert.equal(after.decision.ok, false);
});
