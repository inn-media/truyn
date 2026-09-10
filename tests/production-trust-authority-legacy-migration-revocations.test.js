import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createProductionControlPlane } from '../core/security/production-control-plane.js';
import {
  materializeProductionControlPlaneSnapshot,
  migrateProductionControlPlaneSnapshot
} from '../core/security/production-control-plane-snapshot.js';

function tempDir(t, prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('legacy checkpoint migration carries bootstrap terminal trust revocations without losing legacy revocations', { concurrency: false }, (t) => {
  const clock = new Date('2038-07-01T00:00:00.000Z');
  const sourceDir = tempDir(t, 'truyn-legacy-trust-migration-source-');
  const restoredDir = tempDir(t, 'truyn-legacy-trust-migration-restored-');
  const control = createProductionControlPlane({ stateDir: sourceDir, now: () => new Date(clock) });

  control.revocationAuthority.revoke('membership', 'legacy-membership', { reason: 'legacy-terminal' });
  const legacy = structuredClone(control.snapshot());
  delete legacy.trustAuthority;
  delete legacy.trustAuthorityAnchor;

  const root = createIdentity();
  control.trustAuthority.provisionRoot({
    rootId: 'bootstrap-revoked-root',
    identity: root,
    purposes: ['claim-issuer'],
    scopes: [{ kind: 'domain', value: 'example.com', match: 'subdomain' }],
    expiresAt: '2039-07-01T00:00:00.000Z'
  });
  control.trustAuthority.revokeRoot('bootstrap-revoked-root', { reason: 'bootstrap-terminal' });
  const bootstrap = control.snapshot();

  assert.equal(legacy.revocations.revocations['authority-root:bootstrap-revoked-root'], undefined);
  assert.ok(bootstrap.trustAuthorityAnchor.revokedAuthorityTargets.includes('authority-root:bootstrap-revoked-root'));

  const migrated = migrateProductionControlPlaneSnapshot({ snapshot: legacy, trustBootstrap: bootstrap });
  assert.ok(migrated.revocations.revocations['membership:legacy-membership']);
  assert.ok(migrated.revocations.revocations['authority-root:bootstrap-revoked-root']);

  materializeProductionControlPlaneSnapshot({ snapshot: migrated, stateDir: restoredDir });
  const restored = createProductionControlPlane({ stateDir: restoredDir, now: () => new Date(clock) });
  assert.equal(restored.revocationAuthority.isRevoked('membership', 'legacy-membership'), true);
  assert.equal(restored.revocationAuthority.isRevoked('authority-root', 'bootstrap-revoked-root'), true);
});
