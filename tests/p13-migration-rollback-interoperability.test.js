import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, lstat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createIdentity, verifyValue, signValue } from '../core/identity/index.js';
import { negotiateProtocol } from '../core/protocol/negotiation.js';
import { DurableNetworkState } from '../network/state/persistent-state.js';
import { migrateByokProfileFile, rollbackByokProfileFile } from '../migrations/p13-byok-file.js';
import { readFileSync } from 'node:fs';

async function withDir(fn) {
  const root = await mkdtemp(join(tmpdir(), 'truyn-p13-'));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}
function legacy(a, b) {
  return { schema: 1, provider: 'openai', adapterProvider: 'openai',
    model: 'fixture', credentialEnv: 'P13_TEST_ENV_NAME_NOT_A_SECRET', authMode: 'bearer',
    capabilities: ['reasoning.general'], accessMode: 'owner-only', billingMode: 'byok',
    requesterNodeId: a.nodeId, providerNodeId: b.nodeId, verifiedAt: null };
}
test('P13 persisted pre-v1 schema1 to schema2, idempotence, signed identity and byte-exact rollback', async () => {
  await withDir(async root => {
    const a = createIdentity(), b = createIdentity(), filePath = join(root, 'profile.json');
    const original = Buffer.from(JSON.stringify(legacy(a, b)) + '\n');
    await writeFile(filePath, original, { mode: 0o600 });
    const claim = { protocol: 'TRUYN/1', owner: a.nodeId };
    const signature = signValue(claim, a.privateKeyPem);
    assert.equal((await migrateByokProfileFile({ filePath })).status, 'migrated');
    const migrated = JSON.parse(await readFile(filePath, 'utf8'));
    assert.equal(migrated.schema, 2);
    assert.deepEqual(migrated.credentialRef, { schema: 'truyn.secret-reference/v1',
      backend: 'env', key: 'P13_TEST_ENV_NAME_NOT_A_SECRET' });
    assert.equal(Object.hasOwn(migrated, 'credentialEnv'), false);
    assert.equal(migrated.requesterNodeId, a.nodeId);
    assert.equal(migrated.providerNodeId, b.nodeId);
    assert.equal((await lstat(filePath)).mode & 0o777, 0o600);
    assert.equal((await lstat(filePath + '.p13-checkpoint')).mode & 0o777, 0o600);
    assert.equal(verifyValue(claim, signature, a.publicKeyPem), true);
    assert.equal((await migrateByokProfileFile({ filePath })).status, 'already_v2');
    assert.equal((await rollbackByokProfileFile({ filePath })).status, 'rolled_back');
    assert.deepEqual(await readFile(filePath), original);
    assert.equal(verifyValue(claim, signature, a.publicKeyPem), true);
  });
});
test('P13 invalid legacy versions, identity collapse, and malformed JSON preserve original bytes', async () => {
  await withDir(async root => {
    const a = createIdentity(), b = createIdentity(), filePath = join(root, 'profile.json');
    const candidates = ['{not-json', JSON.stringify({ ...legacy(a, b), schema: 99 }),
      JSON.stringify({ ...legacy(a, b), providerNodeId: a.nodeId })];
    for (const text of candidates) {
      const raw = Buffer.from(text);
      await writeFile(filePath, raw);
      await assert.rejects(migrateByokProfileFile({ filePath }));
      assert.deepEqual(await readFile(filePath), raw);
      await assert.rejects(readFile(filePath + '.p13-checkpoint'), { code: 'ENOENT' });
    }
  });
});
test('P13 tampered checkpoint/target and symlink are rejected without restoring stale state', async () => {
  await withDir(async root => {
    const a = createIdentity(), b = createIdentity(), filePath = join(root, 'profile.json');
    await writeFile(filePath, JSON.stringify(legacy(a, b)));
    await migrateByokProfileFile({ filePath });
    const cpPath = filePath + '.p13-checkpoint';
    const checkpoint = await readFile(cpPath);
    const migrated = await readFile(filePath);
    await writeFile(cpPath, checkpoint.toString().replace(/"originalSha256":"[0-9a-f]+"/, '"originalSha256":"' + '0'.repeat(64) + '"'));
    await assert.rejects(rollbackByokProfileFile({ filePath }), /p13_checkpoint_digest_mismatch/);
    assert.deepEqual(await readFile(filePath), migrated);
    await writeFile(cpPath, checkpoint);
    await writeFile(filePath, '{"schema":2,"corrupted":true}');
    await assert.rejects(rollbackByokProfileFile({ filePath }), /p13_rollback_target_drift/);
    await writeFile(filePath, migrated);
    await symlink(filePath, join(root, 'symlink.json'));
    await assert.rejects(migrateByokProfileFile({ filePath: join(root, 'symlink.json') }), /p13_unsafe_path/);
  });
});
test('P13 actual protocol negotiation retains shared base and rejects incompatible semantics and generation', () => {
  assert.deepEqual(negotiateProtocol({ localProtocols: ['TRUYN/1'], remoteProtocols: ['TRUYN/1'],
    localSemantics: ['core-envelope'], remoteSemantics: ['core-envelope', 'revoke-need'],
    requiredSemantics: ['core-envelope'] }),
    { ok: true, protocol: 'TRUYN/1', semantics: ['core-envelope'] });
  assert.deepEqual(negotiateProtocol({ localProtocols: ['TRUYN/1'], remoteProtocols: ['TRUYN/1'],
    localSemantics: ['core-envelope'], remoteSemantics: ['core-envelope', 'revoke-need'],
    requiredSemantics: ['revoke-need'] }),
    { ok: false, code: 'version_mismatch', reason: 'required_semantic_unavailable',
      protocol: 'TRUYN/1', missingSemantics: ['revoke-need'] });
  assert.deepEqual(negotiateProtocol({ localProtocols: ['TRUYN/1'], remoteProtocols: ['TRUYN/2'] }),
    { ok: false, code: 'version_mismatch', reason: 'no_protocol_overlap' });
});
test('P13 network persistent state retains node ID and rejects unknown storage generations', async () => {
  await withDir(async root => {
    const identity = createIdentity();
    const filePath = join(root, 'network.json');
    const store = new DurableNetworkState({ filePath });
    await store.save({ nodeId: identity.nodeId, sequence: 11, peerRecords: [], dhtRecords: [] });
    const loaded = await store.load();
    assert.equal(loaded.version, 1);
    assert.equal(loaded.nodeId, identity.nodeId);
    assert.equal(loaded.sequence, 11);
    await writeFile(filePath, JSON.stringify({ ...loaded, version: 99 }));
    await assert.rejects(store.load(), /unsupported_network_state_version/);
  });
});
test('P13 published notice floor, stable-breaking boundary and pre-v1 exception remain explicit', () => {
  const policy = readFileSync(new URL('../spec/protocol/v1/migration.md', import.meta.url), 'utf8');
  assert.match(policy, /180 calendar days/i);
  assert.match(policy, /public deprecation notice/i);
  assert.match(policy, /Pre-v1 alpha\/beta interfaces do \*\*not\*\* inherit/);
  assert.match(policy, /new protocol generation/i);
});
