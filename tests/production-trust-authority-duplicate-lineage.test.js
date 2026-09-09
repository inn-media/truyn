import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createAttestation, createClaim } from '../core/claims/index.js';
import { assessActiveTrust, createLineageCertificate } from '../core/trust/lifecycle.js';

function evidence({ claim, attester, sourceId, originId, publisherId, now }) {
  return createAttestation({
    identity: attester,
    claim,
    verdict: 'support',
    evidence: [{ kind: 'source', sourceId }],
    lineage: { originIds: [originId], publisherIds: [publisherId], generatorIds: [] },
    createdAt: new Date(now - 1_000).toISOString()
  });
}

function certificate({ identity, sourceId, originId, publisherId, now }) {
  return createLineageCertificate({
    identity,
    sourceId,
    lineage: { originIds: [originId], publisherIds: [publisherId] },
    issuedAt: new Date(now - 2_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString()
  });
}

test('unauthorized duplicate lineage certificate cannot displace an authorized certificate for the same source', () => {
  const now = Date.parse('2038-08-01T00:00:00.000Z');
  const issuer = createIdentity();
  const attesterA = createIdentity();
  const attesterB = createIdentity();
  const ownerA = createIdentity();
  const ownerB = createIdentity();
  const attacker = createIdentity();

  const claim = createClaim({ identity: issuer, domain: 'security', statement: 'Two independent sources confirm the control state.', createdAt: new Date(now - 3_000).toISOString() });
  const attestationA = evidence({ claim, attester: attesterA, sourceId: 'source-a', originId: 'origin-a', publisherId: 'publisher-a', now });
  const attestationB = evidence({ claim, attester: attesterB, sourceId: 'source-b', originId: 'origin-b', publisherId: 'publisher-b', now });

  const authorizedA = certificate({ identity: ownerA, sourceId: 'source-a', originId: 'origin-a', publisherId: 'publisher-a', now });
  const unauthorizedDuplicateA = certificate({ identity: attacker, sourceId: 'source-a', originId: 'attacker-origin', publisherId: 'attacker-publisher', now });
  const authorizedB = certificate({ identity: ownerB, sourceId: 'source-b', originId: 'origin-b', publisherId: 'publisher-b', now });

  const allowed = new Set([issuer.nodeId, attesterA.nodeId, attesterB.nodeId, ownerA.nodeId, ownerB.nodeId]);
  const authorityRegistry = {
    authorize({ nodeId }) {
      return allowed.has(nodeId) ? { ok: true, authorityEpoch: 7, headHash: 'sha256:test-authority-head' } : { ok: false, reason: 'authority_not_authorized' };
    }
  };

  const baseline = assessActiveTrust({
    claim,
    attestations: [attestationA, attestationB],
    lineageCertificates: [authorizedA, authorizedB],
    authorityRegistry,
    now,
    policy: { minIndependentSupport: 2 }
  });
  assert.equal(baseline.lifecycleStatus, 'verified');
  assert.equal(baseline.activeAttestations, 2);

  const duplicated = assessActiveTrust({
    claim,
    attestations: [attestationA, attestationB],
    lineageCertificates: [authorizedA, unauthorizedDuplicateA, authorizedB],
    authorityRegistry,
    now,
    policy: { minIndependentSupport: 2 }
  });
  assert.equal(duplicated.lifecycleStatus, 'verified');
  assert.equal(duplicated.activeAttestations, 2);
  assert.equal(duplicated.uncertifiedAttestations, 0);
}