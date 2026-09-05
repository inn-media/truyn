import { createHash } from 'node:crypto';
import { signValue, verifyValue } from '../identity/index.js';
import { canonicalize, nodeIdFromPublicKey } from '../protocol/index.js';
import { createDurableJsonStore } from '../security/durable-json-store.js';
import {
  authorityScopeMatches,
  authorityScopesContain,
  createAuthorityCertificate,
  normalizeAuthorityPurposes,
  normalizeAuthorityScope,
  normalizeAuthorityScopes,
  verifyAuthorityCertificate
} from './authority-certificate.js';

export const PRODUCTION_TRUST_AUTHORITY_VERSION = 1;
export const AUTHORITY_ROOT_ROTATION_PROTOCOL = 'truyn-authority-root-rotation-v1';

const digest = (value) => `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
const GENESIS_HEAD = digest({ protocol: 'truyn-production-trust-authority-v1', genesis: true });
const TRUST_REVOCATION_KINDS = new Set(['authority-root', 'authority-certificate', 'authority-key']);

function requiredString(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive integer`);
  return number;
}

function iso(value, label) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} is invalid`);
  return date.toISOString();
}

function authorityError(code, details = null) {
  const error = new Error(code);
  error.code = code;
  if (details != null) error.details = details;
  return error;
}

function publicIdentity(input = {}, label = 'authority identity') {
  const publicKey = requiredString(input.publicKeyPem || input.publicKey, `${label} public key`);
  const nodeId = requiredString(input.nodeId || nodeIdFromPublicKey(publicKey), `${label} nodeId`);
  if (nodeIdFromPublicKey(publicKey) !== nodeId) throw new Error(`${label} key mismatch`);
  return { nodeId, publicKey };
}

function signingIdentity(input = {}, label = 'authority signer') {
  const publicPart = publicIdentity(input, label);
  const privateKey = requiredString(input.privateKeyPem, `${label} private key`);
  return { ...publicPart, privateKey };
}

function authorityStateCommitment(state) {
  return digest({
    version: state.version,
    authorityEpoch: state.authorityEpoch || 0,
    headHash: state.headHash || GENESIS_HEAD,
    roots: state.roots || {},
    certificates: state.certificates || {},
    currentAuthorities: state.currentAuthorities || {},
    events: state.events || []
  });
}

function defaultRegistryState() {
  const state = {
    version: PRODUCTION_TRUST_AUTHORITY_VERSION,
    revision: 0,
    authorityEpoch: 0,
    headHash: GENESIS_HEAD,
    roots: {},
    certificates: {},
    currentAuthorities: {},
    events: []
  };
  state.stateCommitment = authorityStateCommitment(state);
  return state;
}

const GENESIS_STATE_COMMITMENT = defaultRegistryState().stateCommitment;

function defaultAnchorState() {
  return {
    version: PRODUCTION_TRUST_AUTHORITY_VERSION,
    revision: 0,
    minimumStoreRevision: 0,
    minimumAuthorityEpoch: 0,
    headHash: GENESIS_HEAD,
    stateCommitment: GENESIS_STATE_COMMITMENT,
    revokedAuthorityTargets: []
  };
}

function eventHash(event) {
  const { hash: _ignored, ...body } = event;
  return digest(body);
}

function verifyEventChain(state) {
  const events = Array.isArray(state.events) ? state.events : [];
  let previous = GENESIS_HEAD;
  let sequence = 0;
  for (const event of events) {
    sequence += 1;
    if (event.sequence !== sequence || event.prevHash !== previous || eventHash(event) !== event.hash) {
      throw authorityError('authority_transparency_log_invalid', { sequence });
    }
    previous = event.hash;
  }
  if ((state.authorityEpoch || 0) !== sequence) throw authorityError('authority_epoch_log_mismatch');
  if ((state.headHash || GENESIS_HEAD) !== previous) throw authorityError('authority_head_log_mismatch');
  return true;
}

function appendAuthorityEvent(state, { type, subject, at, payload = null }) {
  const sequence = Number.isSafeInteger(state.authorityEpoch) ? state.authorityEpoch + 1 : 1;
  const event = {
    sequence,
    type: requiredString(type, 'authority event type'),
    subject: requiredString(subject, 'authority event subject'),
    at: iso(at, 'authority event time'),
    payloadDigest: digest(payload),
    prevHash: state.headHash || GENESIS_HEAD
  };
  event.hash = eventHash(event);
  state.events ||= [];
  state.events.push(event);
  state.authorityEpoch = sequence;
  state.headHash = event.hash;
  return event;
}

function recordActive(record, atMs) {
  return atMs >= Date.parse(record.notBefore) && atMs < Date.parse(record.expiresAt);
}

function purposesContain(parent, child) {
  const allowed = new Set(normalizeAuthorityPurposes(parent));
  return normalizeAuthorityPurposes(child).every((purpose) => allowed.has(purpose));
}

function revocationKey(kind, id) {
  return `${kind}:${id}`;
}

export function createProductionTrustAuthority({
  filePath,
  anchorFilePath = `${filePath}.anchor`,
  revocationAuthority,
  now = () => new Date()
} = {}) {
  if (!revocationAuthority || typeof revocationAuthority.revoke !== 'function' || typeof revocationAuthority.isRevoked !== 'function') {
    throw new Error('production trust authority requires ProductionRevocationAuthority');
  }

  const registryStore = createDurableJsonStore({
    filePath,
    defaultState: defaultRegistryState(),
    nowMs: () => now().getTime()
  });
  const anchorStore = createDurableJsonStore({
    filePath: anchorFilePath,
    defaultState: defaultAnchorState(),
    nowMs: () => now().getTime()
  });
  const mutationLockStore = createDurableJsonStore({
    filePath: `${anchorFilePath}.mutation`,
    defaultState: { version: 1, revision: 0 },
    nowMs: () => now().getTime()
  });

  function revoked(kind, id) {
    try {
      return revocationAuthority.isRevoked(kind, id);
    } catch (error) {
      throw authorityError('authority_revocation_state_unavailable', error?.message || null);
    }
  }

  function revocationSnapshot() {
    try {
      return revocationAuthority.snapshot();
    } catch (error) {
      throw authorityError('authority_revocation_state_unavailable', error?.message || null);
    }
  }

  function revokedAuthorityTargets(snapshot = revocationSnapshot()) {
    return Object.values(snapshot?.revocations || {})
      .filter((record) => record?.status === 'revoked' && TRUST_REVOCATION_KINDS.has(record.kind))
      .map((record) => revocationKey(record.kind, record.id))
      .sort();
  }

  function validateRegistryState(state) {
    if (!state || state.version !== PRODUCTION_TRUST_AUTHORITY_VERSION) throw authorityError('authority_registry_version_invalid');
    verifyEventChain(state);
    if (state.stateCommitment !== authorityStateCommitment(state)) throw authorityError('authority_state_commitment_invalid');
    return state;
  }

  function validateAnchoredState(state) {
    validateRegistryState(state);
    const anchor = anchorStore.read();
    const storeRevision = Number.isSafeInteger(state.revision) ? state.revision : 0;
    const epoch = Number.isSafeInteger(state.authorityEpoch) ? state.authorityEpoch : 0;
    if (storeRevision < (anchor.minimumStoreRevision || 0) || epoch < (anchor.minimumAuthorityEpoch || 0)) {
      throw authorityError('authority_state_rollback_detected');
    }
    if (storeRevision !== (anchor.minimumStoreRevision || 0) || epoch !== (anchor.minimumAuthorityEpoch || 0)) {
      throw authorityError('authority_state_anchor_stale');
    }
    if ((anchor.headHash || GENESIS_HEAD) !== (state.headHash || GENESIS_HEAD)) throw authorityError('authority_state_head_mismatch');
    if ((anchor.stateCommitment || GENESIS_STATE_COMMITMENT) !== state.stateCommitment) throw authorityError('authority_state_anchor_commitment_mismatch');
    const actualRevocations = new Set(revokedAuthorityTargets());
    for (const target of anchor.revokedAuthorityTargets || []) {
      if (!actualRevocations.has(target)) throw authorityError('authority_revocation_rollback_detected', { target });
    }
    return state;
  }

  function advanceAnchor(state) {
    validateRegistryState(state);
    const actualRevocations = revokedAuthorityTargets();
    return anchorStore.transaction((anchor) => {
      anchor.minimumStoreRevision ||= 0;
      anchor.minimumAuthorityEpoch ||= 0;
      anchor.headHash ||= GENESIS_HEAD;
      anchor.stateCommitment ||= GENESIS_STATE_COMMITMENT;
      anchor.revokedAuthorityTargets ||= [];
      const storeRevision = Number.isSafeInteger(state.revision) ? state.revision : 0;
      const epoch = Number.isSafeInteger(state.authorityEpoch) ? state.authorityEpoch : 0;
      if (storeRevision < anchor.minimumStoreRevision || epoch < anchor.minimumAuthorityEpoch) throw authorityError('authority_state_rollback_detected');
      const actualSet = new Set(actualRevocations);
      for (const target of anchor.revokedAuthorityTargets) {
        if (!actualSet.has(target)) throw authorityError('authority_revocation_rollback_detected', { target });
      }
      anchor.minimumStoreRevision = storeRevision;
      anchor.minimumAuthorityEpoch = epoch;
      anchor.headHash = state.headHash;
      anchor.stateCommitment = state.stateCommitment;
      anchor.revokedAuthorityTargets = actualRevocations;
      return {
        minimumStoreRevision: storeRevision,
        minimumAuthorityEpoch: epoch,
        headHash: state.headHash,
        stateCommitment: state.stateCommitment,
        revokedAuthorityTargets: actualRevocations
      };
    }).result;
  }

  function withMutationLock(callback) {
    return mutationLockStore.transaction(() => callback()).result;
  }

  function readState() {
    return validateAnchoredState(registryStore.read());
  }

  function mutateLocked(mutator) {
    const transaction = registryStore.transaction((state) => {
      if (state.version == null) Object.assign(state, defaultRegistryState());
      validateAnchoredState(state);
      const result = mutator(state);
      state.stateCommitment = authorityStateCommitment(state);
      return result;
    });
    validateRegistryState(transaction.state);
    advanceAnchor(transaction.state);
    validateAnchoredState(transaction.state);
    return transaction.result;
  }

  function mutate(mutator) {
    return withMutationLock(() => mutateLocked(mutator));
  }

  function rootVersionRecord(state, rootId, version) {
    const root = state.roots?.[rootId];
    return root?.versions?.[String(version)] || null;
  }

  function currentRootRecord(state, rootId) {
    const root = state.roots?.[rootId];
    if (!root) return null;
    return rootVersionRecord(state, rootId, root.currentVersion);
  }

  function assertRootNotRevoked(rootId, record, revokedFn = revoked) {
    if (revokedFn('authority-root', rootId)) throw authorityError('authority_root_revoked');
    if (revokedFn('authority-key', record.nodeId)) throw authorityError('authority_key_revoked');
  }

  function provisionRoot({
    rootId,
    identity,
    nodeId,
    publicKey,
    purposes,
    scopes,
    notBefore = now().toISOString(),
    expiresAt = new Date(now().getTime() + 365 * 24 * 60 * 60_000).toISOString()
  } = {}) {
    const id = requiredString(rootId, 'authority rootId');
    const rootIdentity = publicIdentity(identity || { nodeId, publicKey }, 'authority root');
    const normalizedNotBefore = iso(notBefore, 'authority root notBefore');
    const normalizedExpiresAt = iso(expiresAt, 'authority root expiresAt');
    if (Date.parse(normalizedExpiresAt) <= Date.parse(normalizedNotBefore)) throw new Error('authority root expiresAt must be after notBefore');
    const normalizedPurposes = normalizeAuthorityPurposes(purposes);
    const normalizedScopes = normalizeAuthorityScopes(scopes);
    return mutate((state) => {
      state.roots ||= {};
      if (state.roots[id]) throw authorityError('authority_root_already_exists');
      const record = {
        rootId: id,
        version: 1,
        nodeId: rootIdentity.nodeId,
        publicKey: rootIdentity.publicKey,
        purposes: normalizedPurposes,
        scopes: normalizedScopes,
        notBefore: normalizedNotBefore,
        expiresAt: normalizedExpiresAt,
        createdAt: now().toISOString(),
        supersededAt: null,
        rotationProof: null
      };
      state.roots[id] = { rootId: id, currentVersion: 1, versions: { '1': record } };
      appendAuthorityEvent(state, { type: 'root-provisioned', subject: id, at: now().toISOString(), payload: { version: 1, nodeId: record.nodeId, purposes: record.purposes, scopes: record.scopes } });
      return structuredClone(record);
    });
  }

  function rootReference(rootId) {
    const id = requiredString(rootId, 'authority rootId');
    const state = readState();
    const root = state.roots?.[id];
    if (!root) throw authorityError('authority_root_not_found');
    return { type: 'root', id, version: root.currentVersion };
  }

  function rotateRoot({
    rootId,
    identity,
    subject,
    purposes = null,
    scopes = null,
    issuedAt = now().toISOString(),
    notBefore = issuedAt,
    expiresAt = null
  } = {}) {
    const id = requiredString(rootId, 'authority rootId');
    const signer = signingIdentity(identity, 'authority root rotation signer');
    const state = readState();
    const current = currentRootRecord(state, id);
    if (!current) throw authorityError('authority_root_not_found');
    const operationMs = now().getTime();
    assertRootNotRevoked(id, current);
    if (!recordActive(current, operationMs)) throw authorityError('authority_root_rotation_signer_not_current');
    if (current.nodeId !== signer.nodeId || current.publicKey !== signer.publicKey) throw authorityError('authority_root_rotation_signer_mismatch');
    const issued = iso(issuedAt, 'authority root rotation issuedAt');
    if (Date.parse(issued) > operationMs || Date.parse(issued) < Date.parse(current.notBefore)) throw authorityError('authority_root_rotation_issued_at_invalid');
    const activation = iso(notBefore, 'authority root rotation notBefore');
    if (Date.parse(activation) > operationMs) throw authorityError('authority_root_rotation_future_activation');
    const nextIdentity = publicIdentity(subject, 'authority rotated root');
    const nextPurposes = normalizeAuthorityPurposes(purposes || current.purposes);
    const nextScopes = normalizeAuthorityScopes(scopes || current.scopes);
    if (!purposesContain(current.purposes, nextPurposes) || !authorityScopesContain(current.scopes, nextScopes)) throw authorityError('authority_root_rotation_cannot_widen');
    const expiry = iso(expiresAt || current.expiresAt, 'authority root rotation expiresAt');
    if (Date.parse(expiry) <= Date.parse(activation)) throw authorityError('authority_root_rotation_time_invalid');
    const proof = {
      protocol: AUTHORITY_ROOT_ROTATION_PROTOCOL,
      version: 1,
      rootId: id,
      fromVersion: current.version,
      toVersion: current.version + 1,
      fromNodeId: current.nodeId,
      toNodeId: nextIdentity.nodeId,
      toPublicKey: nextIdentity.publicKey,
      purposes: nextPurposes,
      scopes: nextScopes,
      issuedAt: issued,
      notBefore: activation,
      expiresAt: expiry
    };
    const signature = signValue(proof, signer.privateKey);
    if (!verifyValue(proof, signature, signer.publicKey)) throw authorityError('authority_root_rotation_signature_invalid');

    return mutate((draft) => {
      const live = currentRootRecord(draft, id);
      if (!live || live.version !== current.version) throw authorityError('authority_root_rotation_race');
      if (!recordActive(live, now().getTime())) throw authorityError('authority_root_rotation_signer_not_current');
      const rotatedAt = now().toISOString();
      const nextVersion = live.version + 1;
      live.supersededAt = rotatedAt;
      const record = {
        rootId: id,
        version: nextVersion,
        nodeId: nextIdentity.nodeId,
        publicKey: nextIdentity.publicKey,
        purposes: nextPurposes,
        scopes: nextScopes,
        notBefore: activation,
        expiresAt: expiry,
        createdAt: rotatedAt,
        supersededAt: null,
        rotationProof: { proof, signerPublicKey: signer.publicKey, signature }
      };
      draft.roots[id].versions[String(nextVersion)] = record;
      draft.roots[id].currentVersion = nextVersion;
      appendAuthorityEvent(draft, { type: 'root-rotated', subject: id, at: rotatedAt, payload: { fromVersion: live.version, toVersion: nextVersion, fromNodeId: live.nodeId, toNodeId: record.nodeId } });
      return structuredClone(record);
    });
  }

  function validateRootChainRecord(state, issuerRef, atMs, registrationMs = null, revokedFn = revoked) {
    const record = rootVersionRecord(state, issuerRef.id, issuerRef.version);
    if (!record) throw authorityError('authority_issuer_root_not_found');
    assertRootNotRevoked(issuerRef.id, record, revokedFn);
    if (!recordActive(record, atMs)) throw authorityError('authority_issuer_root_not_current');
    if (record.supersededAt && registrationMs != null && registrationMs > Date.parse(record.supersededAt)) throw authorityError('authority_issuer_root_superseded_before_registration');
    return { nodeId: record.nodeId, publicKey: record.publicKey, purposes: record.purposes, scopes: record.scopes, notBefore: record.notBefore, expiresAt: record.expiresAt, rootId: issuerRef.id, rootVersion: record.version };
  }

  function validateCertificateChain(state, certificateId, atMs, seen = new Set(), revokedFn = revoked) {
    if (seen.has(certificateId)) throw authorityError('authority_certificate_cycle');
    seen.add(certificateId);
    const record = state.certificates?.[certificateId];
    if (!record) throw authorityError('authority_certificate_not_found');
    const certificate = record.certificate;
    const verification = verifyAuthorityCertificate(certificate, { now: atMs, allowExpired: true });
    if (!verification.ok) throw authorityError(verification.reason);
    if (revokedFn('authority-certificate', certificateId)) throw authorityError('authority_certificate_revoked');
    if (revokedFn('authority-key', certificate.body.subjectNodeId)) throw authorityError('authority_key_revoked');
    if (!recordActive(certificate.body, atMs)) throw authorityError('authority_certificate_not_current');

    const issuerRef = certificate.body.issuerRef;
    const registeredMs = Date.parse(record.registeredAt);
    let issuer;
    if (issuerRef.type === 'root') {
      issuer = validateRootChainRecord(state, issuerRef, atMs, registeredMs, revokedFn);
    } else {
      const parent = state.certificates?.[issuerRef.id];
      if (!parent) throw authorityError('authority_parent_certificate_not_found');
      issuer = validateCertificateChain(state, issuerRef.id, atMs, seen, revokedFn);
      if (parent.supersededAt && registeredMs > Date.parse(parent.supersededAt)) throw authorityError('authority_parent_superseded_before_registration');
    }
    if (certificate.body.issuerNodeId !== issuer.nodeId || certificate.issuerPublicKey !== issuer.publicKey) throw authorityError('authority_certificate_issuer_mismatch');
    if (!issuer.purposes.includes('delegate')) throw authorityError('authority_issuer_cannot_delegate');
    if (!purposesContain(issuer.purposes, certificate.body.purposes)) throw authorityError('authority_purpose_delegation_widened');
    if (!authorityScopesContain(issuer.scopes, certificate.body.scopes)) throw authorityError('authority_scope_delegation_widened');
    if (Date.parse(certificate.body.notBefore) < Date.parse(issuer.notBefore) || Date.parse(certificate.body.expiresAt) > Date.parse(issuer.expiresAt)) throw authorityError('authority_delegation_time_widened');
    return {
      certificateId,
      authorityId: certificate.body.authorityId,
      authorityVersion: certificate.body.authorityVersion,
      nodeId: certificate.body.subjectNodeId,
      publicKey: certificate.body.subjectPublicKey,
      purposes: certificate.body.purposes,
      scopes: certificate.body.scopes,
      notBefore: certificate.body.notBefore,
      expiresAt: certificate.body.expiresAt,
      issuer
    };
  }

  function issuerContinuityIdentity(state, issuerRef) {
    if (issuerRef.type === 'root') return `root:${issuerRef.id}`;
    const parent = state.certificates?.[issuerRef.id]?.certificate;
    if (!parent) throw authorityError('authority_parent_certificate_not_found');
    return `authority:${parent.body.authorityId}`;
  }

  function registerCertificate(certificate) {
    const nowMs = now().getTime();
    const verification = verifyAuthorityCertificate(certificate, { now: nowMs });
    if (!verification.ok) throw authorityError(verification.reason);
    const state = readState();
    const issuerRef = certificate.body.issuerRef;
    let issuer;
    if (issuerRef.type === 'root') {
      const rootRecord = rootVersionRecord(state, issuerRef.id, issuerRef.version);
      if (!rootRecord) throw authorityError('authority_issuer_root_not_found');
      if (rootRecord.supersededAt) throw authorityError('authority_issuer_root_superseded');
      issuer = validateRootChainRecord(state, issuerRef, nowMs);
    } else {
      const parentRecord = state.certificates?.[issuerRef.id];
      if (!parentRecord) throw authorityError('authority_parent_certificate_not_found');
      if (parentRecord.supersededAt) throw authorityError('authority_parent_certificate_superseded');
      issuer = validateCertificateChain(state, issuerRef.id, nowMs);
    }
    if (certificate.body.issuerNodeId !== issuer.nodeId || certificate.issuerPublicKey !== issuer.publicKey) throw authorityError('authority_certificate_issuer_mismatch');
    if (!issuer.purposes.includes('delegate')) throw authorityError('authority_issuer_cannot_delegate');
    if (!purposesContain(issuer.purposes, certificate.body.purposes)) throw authorityError('authority_purpose_delegation_widened');
    if (!authorityScopesContain(issuer.scopes, certificate.body.scopes)) throw authorityError('authority_scope_delegation_widened');
    if (Date.parse(certificate.body.notBefore) < Date.parse(issuer.notBefore) || Date.parse(certificate.body.expiresAt) > Date.parse(issuer.expiresAt)) throw authorityError('authority_delegation_time_widened');

    return mutate((draft) => {
      draft.certificates ||= {};
      draft.currentAuthorities ||= {};
      if (draft.certificates[certificate.certificateId]) return structuredClone(draft.certificates[certificate.certificateId]);
      const currentId = draft.currentAuthorities[certificate.body.authorityId] || null;
      if (!currentId) {
        if (certificate.body.authorityVersion !== 1 || certificate.body.replacesCertificateId != null) throw authorityError('authority_initial_version_invalid');
      } else {
        const currentRecord = draft.certificates[currentId];
        if (!currentRecord) throw authorityError('authority_current_certificate_missing');
        const expectedVersion = currentRecord.certificate.body.authorityVersion + 1;
        if (certificate.body.authorityVersion !== expectedVersion) throw authorityError('authority_version_rollback_or_gap');
        if (certificate.body.replacesCertificateId !== currentId) throw authorityError('authority_rotation_replacement_mismatch');
        const previousIssuer = issuerContinuityIdentity(draft, currentRecord.certificate.body.issuerRef);
        const nextIssuer = issuerContinuityIdentity(draft, certificate.body.issuerRef);
        if (previousIssuer !== nextIssuer) throw authorityError('authority_rotation_issuer_continuity_required');
        currentRecord.supersededAt = now().toISOString();
      }
      const record = { certificate: structuredClone(certificate), registeredAt: now().toISOString(), supersededAt: null };
      draft.certificates[certificate.certificateId] = record;
      draft.currentAuthorities[certificate.body.authorityId] = certificate.certificateId;
      appendAuthorityEvent(draft, {
        type: currentId ? 'delegation-rotated' : 'delegation-issued',
        subject: certificate.body.authorityId,
        at: now().toISOString(),
        payload: { certificateId: certificate.certificateId, authorityVersion: certificate.body.authorityVersion, subjectNodeId: certificate.body.subjectNodeId, issuerRef: certificate.body.issuerRef, purposes: certificate.body.purposes, scopes: certificate.body.scopes }
      });
      return structuredClone(record);
    });
  }

  function issueCertificate({ identity, issuerRef, authorityId, authorityVersion = null, subject, purposes, scopes, issuedAt, notBefore, expiresAt } = {}) {
    const state = readState();
    const currentId = state.currentAuthorities?.[requiredString(authorityId, 'authorityId')] || null;
    const current = currentId ? state.certificates[currentId]?.certificate : null;
    const version = authorityVersion == null ? (current ? current.body.authorityVersion + 1 : 1) : positiveInteger(authorityVersion, 'authorityVersion');
    const certificate = createAuthorityCertificate({
      identity,
      issuerRef,
      authorityId,
      authorityVersion: version,
      subject,
      purposes,
      scopes,
      replacesCertificateId: currentId,
      issuedAt: issuedAt || now().toISOString(),
      notBefore: notBefore || issuedAt || now().toISOString(),
      expiresAt: expiresAt || new Date(now().getTime() + 30 * 24 * 60 * 60_000).toISOString()
    });
    registerCertificate(certificate);
    return certificate;
  }

  function authorizeInState(state, { nodeId, publicKey = null, purpose, scope, at = now().getTime() } = {}, revokedFn = revoked) {
    try {
      const requesterNodeId = requiredString(nodeId, 'authority nodeId');
      const requesterPublicKey = publicKey == null ? null : publicIdentity({ nodeId: requesterNodeId, publicKey }, 'authority requester').publicKey;
      const requestedPurpose = normalizeAuthorityPurposes([purpose])[0];
      const requestedScope = normalizeAuthorityScope(scope);
      const atMs = typeof at === 'number' ? at : new Date(at).getTime();
      if (!Number.isFinite(atMs)) return { ok: false, reason: 'authority_time_invalid' };

      for (const root of Object.values(state.roots || {})) {
        const record = rootVersionRecord(state, root.rootId, root.currentVersion);
        if (!record || record.nodeId !== requesterNodeId) continue;
        if (requesterPublicKey && record.publicKey !== requesterPublicKey) continue;
        assertRootNotRevoked(root.rootId, record, revokedFn);
        if (!recordActive(record, atMs)) continue;
        if (!record.purposes.includes(requestedPurpose)) continue;
        if (!record.scopes.some((granted) => authorityScopeMatches(granted, requestedScope))) continue;
        return { ok: true, authorityType: 'root', rootId: root.rootId, rootVersion: record.version, nodeId: requesterNodeId, purpose: requestedPurpose, scope: requestedScope, authorityEpoch: state.authorityEpoch, headHash: state.headHash, stateCommitment: state.stateCommitment };
      }

      for (const certificateId of Object.values(state.currentAuthorities || {})) {
        const record = state.certificates?.[certificateId];
        if (!record?.certificate || record.certificate.body.subjectNodeId !== requesterNodeId) continue;
        if (requesterPublicKey && record.certificate.body.subjectPublicKey !== requesterPublicKey) continue;
        let chain;
        try {
          chain = validateCertificateChain(state, certificateId, atMs, new Set(), revokedFn);
        } catch {
          continue;
        }
        if (!chain.purposes.includes(requestedPurpose)) continue;
        if (!chain.scopes.some((granted) => authorityScopeMatches(granted, requestedScope))) continue;
        return { ok: true, authorityType: 'delegated', certificateId, authorityId: chain.authorityId, authorityVersion: chain.authorityVersion, nodeId: requesterNodeId, purpose: requestedPurpose, scope: requestedScope, authorityEpoch: state.authorityEpoch, headHash: state.headHash, stateCommitment: state.stateCommitment };
      }
      return { ok: false, reason: 'authority_key_not_authorized', authorityEpoch: state.authorityEpoch, headHash: state.headHash, stateCommitment: state.stateCommitment };
    } catch (error) {
      return { ok: false, reason: error?.code || error?.message || 'authority_resolution_failed' };
    }
  }

  function authorize(input = {}) {
    return authorizeInState(readState(), input);
  }

  function recordRevocationEventLocked(type, subject, payload) {
    return mutateLocked((state) => appendAuthorityEvent(state, { type, subject, at: now().toISOString(), payload }));
  }

  function revokeCertificate(certificateId, { reason = 'authority_delegation_revoked' } = {}) {
    const id = requiredString(certificateId, 'authority certificateId');
    return withMutationLock(() => {
      const result = revocationAuthority.revoke('authority-certificate', id, { reason });
      recordRevocationEventLocked('delegation-revoked', id, { reason });
      return result;
    });
  }

  function revokeDelegation(authorityId, options = {}) {
    const id = requiredString(authorityId, 'authorityId');
    const state = readState();
    const certificateId = state.currentAuthorities?.[id];
    if (!certificateId) throw authorityError('authority_delegation_not_found');
    return revokeCertificate(certificateId, options);
  }

  function emergencyRevokeKey(nodeId, { reason = 'authority_key_compromised' } = {}) {
    const id = requiredString(nodeId, 'authority key nodeId');
    return withMutationLock(() => {
      const result = revocationAuthority.revoke('authority-key', id, { reason });
      recordRevocationEventLocked('key-emergency-revoked', id, { reason });
      return result;
    });
  }

  function revokeRoot(rootId, { reason = 'authority_root_revoked' } = {}) {
    const id = requiredString(rootId, 'authority rootId');
    return withMutationLock(() => {
      const result = revocationAuthority.revoke('authority-root', id, { reason });
      recordRevocationEventLocked('root-revoked', id, { reason });
      return result;
    });
  }

  function head() {
    const state = readState();
    const targets = revokedAuthorityTargets();
    return {
      revision: state.revision || 0,
      authorityEpoch: state.authorityEpoch || 0,
      headHash: state.headHash || GENESIS_HEAD,
      stateCommitment: state.stateCommitment,
      revocationCommitment: digest(targets)
    };
  }

  function pin() {
    const state = structuredClone(readState());
    const revocations = revocationSnapshot();
    const revokedSet = new Set(Object.values(revocations?.revocations || {}).filter((record) => record?.status === 'revoked').map((record) => revocationKey(record.kind, record.id)));
    const frozenRevoked = (kind, id) => revokedSet.has(revocationKey(kind, id));
    const pinnedHead = Object.freeze({
      revision: state.revision || 0,
      authorityEpoch: state.authorityEpoch || 0,
      headHash: state.headHash || GENESIS_HEAD,
      stateCommitment: state.stateCommitment,
      revocationCommitment: digest([...revokedSet].filter((key) => TRUST_REVOCATION_KINDS.has(key.split(':', 1)[0])).sort())
    });
    return Object.freeze({
      pinned: true,
      authorize: (input = {}) => authorizeInState(state, input, frozenRevoked),
      head: () => pinnedHead,
      snapshot: () => structuredClone(state)
    });
  }

  // The registry and the independent anchor must agree at construction. We fail
  // closed on an interrupted cross-file commit rather than silently accepting an
  // unanchored authority state.
  validateAnchoredState(registryStore.read());

  return Object.freeze({
    durable: true,
    provisionRoot,
    rotateRoot,
    rootReference,
    issueCertificate,
    registerCertificate,
    authorize,
    pin,
    revokeCertificate,
    revokeDelegation,
    emergencyRevokeKey,
    revokeRoot,
    head,
    snapshot: () => structuredClone(readState()),
    anchorSnapshot: () => structuredClone(anchorStore.read())
  });
}
