import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { canonicalize } from '../protocol/index.js';

const LEGACY_SNAPSHOT_KEYS = Object.freeze([
  'accountTenant',
  'revocations',
  'grants',
  'entitlements',
  'accounting'
]);
const SNAPSHOT_KEYS = Object.freeze([
  ...LEGACY_SNAPSHOT_KEYS,
  'trustAuthority',
  'trustAuthorityAnchor'
]);
const FILES = Object.freeze({
  accountTenant: 'account-tenant.json',
  revocations: 'revocations.json',
  grants: 'provider-grants.json',
  entitlements: 'entitlements.json',
  accounting: 'accounting.json',
  trustAuthority: 'trust-authority.json',
  trustAuthorityAnchor: 'trust-authority.anchor.json'
});
const TRUST_REVOCATION_KINDS = new Set(['authority-root', 'authority-key', 'authority-certificate']);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function validateBaseSnapshot(snapshot, keys) {
  if (!isObject(snapshot)) throw new Error('production authority snapshot must be an object');
  for (const key of keys) {
    if (!isObject(snapshot[key])) throw new Error(`production authority snapshot missing ${key}`);
  }
  const accountTenant = snapshot.accountTenant;
  if (!isObject(accountTenant.accountTenant)) throw new Error('production authority accountTenant storage snapshot is invalid');
  for (const key of ['accounts', 'organizations', 'tenants', 'memberships', 'nodeBindings', 'providerBindings']) {
    if (!Array.isArray(accountTenant.accountTenant[key])) throw new Error(`production authority accountTenant.${key} must be an array`);
  }
  for (const key of keys) {
    const state = snapshot[key];
    if (!Number.isSafeInteger(state.revision) || state.revision < 0) {
      throw new Error(`production authority ${key} revision must be a non-negative integer`);
    }
  }
  return snapshot;
}

function revocationDigest(value) {
  return `sha256:${createHash('sha256').update(canonicalize(value)).digest('hex')}`;
}

function revocationEventId(event) {
  const { eventId: _eventId, eventHash: _eventHash, ...body } = event;
  return `truyn:revocation:${revocationDigest(body).slice('sha256:'.length)}`;
}

function revocationEventHash(event) {
  const { eventHash: _eventHash, ...body } = event;
  return revocationDigest(body);
}

function mergeBootstrapTrustRevocations(legacyState, bootstrapState) {
  const merged = structuredClone(legacyState);
  if (!isObject(merged) || !isObject(bootstrapState)) throw new Error('production authority revocation snapshot is invalid');
  if (!Array.isArray(merged.events) || !Array.isArray(bootstrapState.events)) throw new Error('production authority revocation event log is invalid');
  if (!isObject(merged.revocations) || !isObject(bootstrapState.revocations)) throw new Error('production authority revocation map is invalid');
  if (!isObject(merged.kindEpochs)) throw new Error('production authority revocation epochs are invalid');
  if (!Number.isSafeInteger(merged.sequence) || merged.sequence < 0 || merged.authorityEpoch !== merged.sequence || typeof merged.headHash !== 'string' || !merged.headHash) {
    throw new Error('production authority revocation head is invalid');
  }

  let imported = 0;
  for (const incoming of bootstrapState.events) {
    if (!TRUST_REVOCATION_KINDS.has(incoming?.targetKind)) continue;
    const key = `${incoming.targetKind}:${incoming.targetId}`;
    if (merged.revocations[key]) continue;
    const sourceRecord = bootstrapState.revocations[key];
    if (!sourceRecord || sourceRecord.status !== 'revoked' || sourceRecord.eventId !== incoming.eventId) {
      throw new Error('production authority bootstrap trust revocation is invalid');
    }

    const event = structuredClone(incoming);
    delete event.eventId;
    delete event.eventHash;
    event.sequence = merged.sequence + 1;
    event.authorityEpoch = event.sequence;
    event.previousHash = merged.headHash;
    event.eventId = revocationEventId(event);
    event.eventHash = revocationEventHash(event);

    merged.events.push(event);
    merged.sequence = event.sequence;
    merged.authorityEpoch = event.authorityEpoch;
    merged.headHash = event.eventHash;
    merged.kindEpochs[event.kind] = (Number.isSafeInteger(merged.kindEpochs[event.kind]) ? merged.kindEpochs[event.kind] : 0) + 1;
    merged.revocations[key] = { ...structuredClone(sourceRecord), eventId: event.eventId };
    imported += 1;
  }
  if (imported > 0) merged.revision += 1;
  return merged;
}

export function isLegacyProductionControlPlaneSnapshot(snapshot) {
  if (!isObject(snapshot)) return false;
  if (isObject(snapshot.trustAuthority) || isObject(snapshot.trustAuthorityAnchor)) return false;
  return LEGACY_SNAPSHOT_KEYS.every((key) => isObject(snapshot[key]));
}

export function validateLegacyProductionControlPlaneSnapshot(snapshot) {
  if (!isLegacyProductionControlPlaneSnapshot(snapshot)) throw new Error('production authority legacy snapshot shape is invalid');
  return validateBaseSnapshot(snapshot, LEGACY_SNAPSHOT_KEYS);
}

export function validateProductionControlPlaneSnapshot(snapshot) {
  return validateBaseSnapshot(snapshot, SNAPSHOT_KEYS);
}

export function productionControlPlaneSnapshotDigest(snapshot) {
  validateProductionControlPlaneSnapshot(snapshot);
  return createHash('sha256').update(canonical(snapshot)).digest('hex');
}

export function productionControlPlaneLegacySnapshotDigest(snapshot) {
  validateLegacyProductionControlPlaneSnapshot(snapshot);
  return createHash('sha256').update(canonical(snapshot)).digest('hex');
}

export function migrateProductionControlPlaneSnapshot({ snapshot, trustBootstrap } = {}) {
  validateLegacyProductionControlPlaneSnapshot(snapshot);
  validateProductionControlPlaneSnapshot(trustBootstrap);
  const migrated = {
    ...structuredClone(snapshot),
    revocations: mergeBootstrapTrustRevocations(snapshot.revocations, trustBootstrap.revocations),
    trustAuthority: structuredClone(trustBootstrap.trustAuthority),
    trustAuthorityAnchor: structuredClone(trustBootstrap.trustAuthorityAnchor)
  };
  validateProductionControlPlaneSnapshot(migrated);
  return migrated;
}

export function verifyProductionControlPlaneSnapshotDigest(snapshot, expectedDigest) {
  if (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedDigest)) {
    throw new Error('production authority snapshot digest must be SHA-256');
  }
  const actual = productionControlPlaneSnapshotDigest(snapshot);
  if (actual !== expectedDigest.toLowerCase()) throw new Error('production_authority_snapshot_digest_mismatch');
  return actual;
}

export function verifyLegacyProductionControlPlaneSnapshotDigest(snapshot, expectedDigest) {
  if (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedDigest)) {
    throw new Error('production authority snapshot digest must be SHA-256');
  }
  const actual = productionControlPlaneLegacySnapshotDigest(snapshot);
  if (actual !== expectedDigest.toLowerCase()) throw new Error('production_authority_snapshot_digest_mismatch');
  return actual;
}

function atomicWriteJson(directory, filename, value) {
  const destination = join(directory, filename);
  const temporary = `${destination}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`;
  let fd = null;
  try {
    fd = openSync(temporary, 'wx', 0o600);
    writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = null;
    renameSync(temporary, destination);
  } finally {
    if (fd != null) closeSync(fd);
  }
}

export function materializeProductionControlPlaneSnapshot({ snapshot, stateDir } = {}) {
  validateProductionControlPlaneSnapshot(snapshot);
  if (typeof stateDir !== 'string' || !stateDir.trim()) throw new Error('production authority materialization stateDir is required');
  const directory = resolve(stateDir);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const key of SNAPSHOT_KEYS) atomicWriteJson(directory, FILES[key], snapshot[key]);
  const dirFd = openSync(directory, 'r');
  try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
  return directory;
}

export function productionControlPlaneSnapshotCounts(snapshot) {
  validateProductionControlPlaneSnapshot(snapshot);
  const accountTenant = snapshot.accountTenant.accountTenant;
  return Object.freeze({
    accounts: accountTenant.accounts.length,
    organizations: accountTenant.organizations.length,
    tenants: accountTenant.tenants.length,
    memberships: accountTenant.memberships.length,
    nodeBindings: accountTenant.nodeBindings.length,
    providerBindings: accountTenant.providerBindings.length,
    revocations: Object.keys(snapshot.revocations.revocations || {}).length,
    providerPolicies: Object.keys(snapshot.grants.providerPolicies || {}).length,
    grants: Object.keys(snapshot.grants.grants || {}).length,
    entitlements: Object.keys(snapshot.entitlements.entitlements || {}).length,
    reservations: Object.keys(snapshot.accounting.reservations || {}).length,
    ledgers: Object.keys(snapshot.accounting.ledgers || {}).length
  });
}
