// Offline-only, bounded persisted BYOK schema-1 -> schema-2 migration.
// Owner must quiesce the consuming process. No TRUYN wire-generation migration is implied.
import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { migrateByokProfile, validateMigratedByokProfile } from '../runtime/byok-profile-migration.js';

const CHECKPOINT_SCHEMA = 'truyn.p13-byok-checkpoint/v1';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function parse(bytes, label) {
  try {
    const obj = JSON.parse(bytes.toString('utf8'));
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
  } catch { /* deterministic fail-closed error below */ }
  throw new Error(label + '_invalid_json');
}
async function regular(path, missingOK = false) {
  try {
    const st = await lstat(path);
    if (!st.isFile() || st.isSymbolicLink()) throw new Error('p13_unsafe_path');
    return st;
  } catch (e) {
    if (missingOK && e.code === 'ENOENT') return null;
    throw e;
  }
}
async function writeExclusive(path, data) {
  const fh = await open(path, 'wx', 0o600);
  try { await fh.writeFile(data); await fh.sync(); } finally { await fh.close(); }
}
async function syncParent(path) {
  try {
    const fh = await open(dirname(path), 'r');
    try { await fh.sync(); } finally { await fh.close(); }
  } catch { /* consistent with DurableNetworkState on platforms without directory fsync */ }
}
function authoritySame(a, b) {
  return ['provider', 'providerNodeId', 'requesterNodeId', 'accessMode', 'billingMode']
    .every((key) => a[key] === b[key]);
}
function checkpointFrom(bytes) {
  const cp = parse(bytes, 'p13_checkpoint');
  if (cp.schema !== CHECKPOINT_SCHEMA || !/^[a-f0-9]{64}$/.test(cp.originalSha256 || '')
    || !/^[a-f0-9]{64}$/.test(cp.migratedSha256 || '')
    || typeof cp.originalBase64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(cp.originalBase64)) {
    throw new Error('p13_invalid_checkpoint');
  }
  const original = Buffer.from(cp.originalBase64, 'base64');
  if (original.toString('base64') !== cp.originalBase64 || hash(original) !== cp.originalSha256)
    throw new Error('p13_checkpoint_digest_mismatch');
  const legacy = parse(original, 'p13_original');
  if (legacy.schema !== 1) throw new Error('p13_invalid_original_schema');
  const migrated = migrateByokProfile(legacy);
  const canonicalTarget = Buffer.from(JSON.stringify(migrated) + '\n');
  if (hash(canonicalTarget) !== cp.migratedSha256 || !authoritySame(legacy, migrated))
    throw new Error('p13_checkpoint_target_mismatch');
  return { cp, original, legacy };
}
export async function migrateByokProfileFile({ filePath, checkpointPath = filePath + '.p13-checkpoint' }) {
  if (typeof filePath !== 'string' || !filePath.trim() || checkpointPath === filePath) throw new Error('p13_invalid_paths');
  await regular(filePath);
  const raw = await readFile(filePath), parsed = parse(raw, 'p13_source');
  if (parsed.schema === 2) {
    validateMigratedByokProfile(parsed);
    if (await regular(checkpointPath, true)) {
      const { cp } = checkpointFrom(await readFile(checkpointPath));
      if (hash(raw) !== cp.migratedSha256) throw new Error('p13_migrated_state_drift');
    }
    return { status: 'already_v2', sha256: hash(raw) };
  }
  if (parsed.schema !== 1) throw new Error('p13_unsupported_schema');
  const migrated = migrateByokProfile(parsed);
  validateMigratedByokProfile(migrated);
  if (!authoritySame(parsed, migrated)) throw new Error('p13_authority_drift');
  if (await regular(checkpointPath, true)) throw new Error('p13_checkpoint_already_exists');
  const target = Buffer.from(JSON.stringify(migrated) + '\n');
  const checkpoint = Buffer.from(JSON.stringify({ schema: CHECKPOINT_SCHEMA,
    originalSha256: hash(raw), migratedSha256: hash(target), originalBase64: raw.toString('base64') }) + '\n');
  await mkdir(dirname(checkpointPath), { recursive: true, mode: 0o700 });
  if (hash(await readFile(filePath)) !== hash(raw)) throw new Error('p13_source_raced');
  await writeExclusive(checkpointPath, checkpoint);
  const temp = filePath + '.p13-new-' + process.pid + '-' + Date.now();
  try {
    if (hash(await readFile(filePath)) !== hash(raw)) throw new Error('p13_source_raced');
    await writeExclusive(temp, target);
    await rename(temp, filePath);
    await syncParent(filePath);
  } finally {
    await rm(temp, { force: true });
  }
  return { status: 'migrated', originalSha256: hash(raw), migratedSha256: hash(target) };
}
export async function rollbackByokProfileFile({ filePath, checkpointPath = filePath + '.p13-checkpoint' }) {
  if (typeof filePath !== 'string' || !filePath.trim() || checkpointPath === filePath) throw new Error('p13_invalid_paths');
  await regular(filePath); await regular(checkpointPath);
  const { cp, original, legacy } = checkpointFrom(await readFile(checkpointPath));
  const target = await readFile(filePath);
  if (hash(target) !== cp.migratedSha256) throw new Error('p13_rollback_target_drift');
  const migrated = parse(target, 'p13_target');
  validateMigratedByokProfile(migrated);
  if (!authoritySame(legacy, migrated)) throw new Error('p13_authority_drift');
  const temp = filePath + '.p13-restore-' + process.pid + '-' + Date.now();
  try {
    await writeExclusive(temp, original);
    await rename(temp, filePath);
    await syncParent(filePath);
  } finally {
    await rm(temp, { force: true });
  }
  return { status: 'rolled_back', restoredSha256: hash(original) };
}
