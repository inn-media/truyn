import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SNAPSHOT_KEYS = Object.freeze(['accountTenant', 'revocations', 'grants', 'entitlements', 'accounting']);
const FILES = Object.freeze({
  accountTenant: 'account-tenant.json',
  revocations: 'revocations.json',
  grants: 'provider-grants.json',
  entitlements: 'entitlements.json',
  accounting: 'accounting.json'
});

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

export function validateProductionControlPlaneSnapshot(snapshot) {
  if (!isObject(snapshot)) throw new Error('production authority snapshot must be an object');
  for (const key of SNAPSHOT_KEYS) {
    if (!isObject(snapshot[key])) throw new Error(`production authority snapshot missing ${key}`);
  }
  const accountTenant = snapshot.accountTenant;
  if (!isObject(accountTenant.accountTenant)) throw new Error('production authority accountTenant storage snapshot is invalid');
  for (const key of ['accounts', 'organizations', 'tenants', 'memberships', 'nodeBindings', 'providerBindings']) {
    if (!Array.isArray(accountTenant.accountTenant[key])) throw new Error(`production authority accountTenant.${key} must be an array`);
  }
  for (const [key, state] of Object.entries(snapshot)) {
    if (!Number.isSafeInteger(state.revision) || state.revision < 0) {
      throw new Error(`production authority ${key} revision must be a non-negative integer`);
    }
  }
  return snapshot;
}

export function productionControlPlaneSnapshotDigest(snapshot) {
  validateProductionControlPlaneSnapshot(snapshot);
  return createHash('sha256').update(canonical(snapshot)).digest('hex');
}

export function verifyProductionControlPlaneSnapshotDigest(snapshot, expectedDigest) {
  if (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedDigest)) {
    throw new Error('production authority snapshot digest must be SHA-256');
  }
  const actual = productionControlPlaneSnapshotDigest(snapshot);
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
