import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIdentity } from '../core/identity/index.js';
import { createProductionRevocationAuthority } from '../core/security/production-revocation-authority.js';
import { createProductionTrustAuthority } from '../core/trust/authority-registry.js';

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

function coordinates(registry, anchor) {
  return {
    storeRevision: registry.revision,
    authorityEpoch: registry.authorityEpoch,
    headHash: registry.headHash,
    stateCommitment: registry.stateCommitment,
    revokedAuthorityTargets: [...(anchor.revokedAuthorityTargets || [])]
  };
}

function preparedAnchor(oldAnchor, oldRegistry, newRegistry, newAnchor) {
  return {
    ...oldAnchor,
    preparedTransition: {
      version: 1,
      from: coordinates(oldRegistry, oldAnchor),
      to: coordinates(newRegistry, newAnchor)
    }
  };
}

function authorityAt(dir, clock) {
  const revocationAuthority = createProductionRevocationAuthority({
    filePath: join(dir, 'revocations.json'),
    now: () => clock.toISOString()
  });
  return createProductionTrustAuthority({
    filePath: join(dir, 'trust-authority.json'),
    anchorFilePath: join(dir, 'trust-authority.anchor.json'),
    revocationAuthority,
    now: () => new Date(clock)
  });
}

function buildTransitionFixture(t) {
  const dir = tempDir(t, 'truyn-authority-transition-source-');
  const clock = new Date('2038-05-01T00:00:00.000Z');
  const authority = authorityAt(dir, clock);
  const first = createIdentity();
  const second = createIdentity();

  authority.provisionRoot({
    rootId: 'root-before-crash',
    identity: first,
    purposes: ['claim-issuer'],
    scopes: [{ kind: 'domain', value: 'example.com', match: 'subdomain' }],
    expiresAt: '2039-05-01T00:00:00.000Z'
  });
  const oldRegistry = readJson(join(dir, 'trust-authority.json'));
  const oldAnchor = readJson(join(dir, 'trust-authority.anchor.json'));

  authority.provisionRoot({
    rootId: 'root-after-crash',
    identity: second,
    purposes: ['claim-issuer'],
    scopes: [{ kind: 'domain', value: 'example.org', match: 'subdomain' }],
    expiresAt: '2039-05-01T00:00:00.000Z'
  });
  const newRegistry = readJson(join(dir, 'trust-authority.json'));
  const newAnchor = readJson(join(dir, 'trust-authority.anchor.json'));

  return { clock, oldRegistry, oldAnchor, newRegistry, newAnchor };
}

function materializeScenario(t, fixture, { registry, anchor }) {
  const dir = tempDir(t, 'truyn-authority-transition-recovery-');
  writeJson(join(dir, 'trust-authority.json'), registry);
  writeJson(join(dir, 'trust-authority.anchor.json'), anchor);
  return { dir, authority: () => authorityAt(dir, fixture.clock) };
}

test('prepared transition with old registry clears safely without advancing authority state', { concurrency: false }, (t) => {
  const fixture = buildTransitionFixture(t);
  const anchor = preparedAnchor(fixture.oldAnchor, fixture.oldRegistry, fixture.newRegistry, fixture.newAnchor);
  const scenario = materializeScenario(t, fixture, { registry: fixture.oldRegistry, anchor });

  const recovered = scenario.authority();
  assert.equal(recovered.snapshot().revision, fixture.oldRegistry.revision);
  assert.equal(recovered.anchorSnapshot().minimumStoreRevision, fixture.oldAnchor.minimumStoreRevision);
  assert.equal(recovered.anchorSnapshot().preparedTransition, undefined);
});

test('prepared transition with exact new registry finalizes the intended anchor state', { concurrency: false }, (t) => {
  const fixture = buildTransitionFixture(t);
  const anchor = preparedAnchor(fixture.oldAnchor, fixture.oldRegistry, fixture.newRegistry, fixture.newAnchor);
  const scenario = materializeScenario(t, fixture, { registry: fixture.newRegistry, anchor });

  const recovered = scenario.authority();
  const recoveredAnchor = recovered.anchorSnapshot();
  assert.equal(recovered.snapshot().revision, fixture.newRegistry.revision);
  assert.equal(recoveredAnchor.minimumStoreRevision, fixture.newRegistry.revision);
  assert.equal(recoveredAnchor.minimumAuthorityEpoch, fixture.newRegistry.authorityEpoch);
  assert.equal(recoveredAnchor.headHash, fixture.newRegistry.headHash);
  assert.equal(recoveredAnchor.stateCommitment, fixture.newRegistry.stateCommitment);
  assert.equal(recoveredAnchor.preparedTransition, undefined);
});

test('unprepared or mismatched forward registry remains fail-closed', { concurrency: false }, (t) => {
  const fixture = buildTransitionFixture(t);

  const unprepared = materializeScenario(t, fixture, {
    registry: fixture.newRegistry,
    anchor: fixture.oldAnchor
  });
  assert.throws(() => unprepared.authority(), /authority_state_anchor_stale/);

  const mismatched = preparedAnchor(fixture.oldAnchor, fixture.oldRegistry, fixture.newRegistry, fixture.newAnchor);
  mismatched.preparedTransition.to = {
    ...mismatched.preparedTransition.to,
    storeRevision: mismatched.preparedTransition.to.storeRevision + 1
  };
  const mismatchScenario = materializeScenario(t, fixture, {
    registry: fixture.newRegistry,
    anchor: mismatched
  });
  assert.throws(() => mismatchScenario.authority(), /authority_state_anchor_stale/);
});
