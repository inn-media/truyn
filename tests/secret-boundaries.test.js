import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EnvironmentSecretStore, createSecretReference, resolveSecret } from '../runtime/secret-store.js';
import { providerAdapterOptionsWithSecretStore, providerCredentialReference } from '../runtime/byok-secret-store.js';

const execFileAsync = promisify(execFile);

function assertSentinelAbsent(sentinel, surfaces) {
  for (const [name, value] of Object.entries(surfaces)) {
    const rendered = Buffer.isBuffer(value) ? value.toString('latin1') : String(value);
    assert.equal(rendered.includes(sentinel), false, `secret sentinel leaked into ${name}`);
  }
}

test('secret sentinel stays out of persisted profiles, protocol-shaped payloads, structured logs and errors', async () => {
  const sentinel = `OPEN1_SECRET_${randomUUID()}`;
  const environment = { OPEN1_PROVIDER_KEY: sentinel };
  const store = new EnvironmentSecretStore(environment);
  const profile = {
    provider: 'openai',
    authMode: 'bearer',
    credentialEnv: 'OPEN1_PROVIDER_KEY',
    model: 'test-model',
    capabilities: ['reasoning.general']
  };

  const reference = providerCredentialReference(profile);
  const options = await providerAdapterOptionsWithSecretStore(profile, store);
  assert.equal(options.apiKey, sentinel, 'credential must still reach the in-memory provider adapter boundary');

  const persistedProfile = JSON.stringify({ ...profile, credentialRef: reference });
  const protocolPayload = JSON.stringify({ provider: profile.provider, model: profile.model, credentialRef: reference });
  const structuredLog = JSON.stringify({ event: 'provider.configured', provider: profile.provider, credentialRef: reference });

  let errorText = '';
  try {
    await resolveSecret(new EnvironmentSecretStore({}), createSecretReference({ backend: 'env', key: 'OPEN1_PROVIDER_KEY' }));
  } catch (error) {
    errorText = `${error.name}: ${error.message}`;
  }
  assert.match(errorText, /could not resolve/);

  assertSentinelAbsent(sentinel, { persistedProfile, protocolPayload, structuredLog, errorText });
});

test('release package artifact does not capture an injected secret sentinel', async () => {
  const sentinel = `OPEN1_RELEASE_SECRET_${randomUUID()}`;
  const destination = await mkdtemp(join(tmpdir(), 'truyn-open1-s122-'));
  try {
    const { stdout } = await execFileAsync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', destination], {
      cwd: process.cwd(),
      env: { ...process.env, OPEN1_RELEASE_SECRET: sentinel },
      maxBuffer: 10 * 1024 * 1024
    });
    const packed = JSON.parse(stdout);
    assert.equal(Array.isArray(packed), true);
    assert.equal(packed.length, 1);
    const artifact = await readFile(join(destination, packed[0].filename));
    assertSentinelAbsent(sentinel, { releaseArtifact: artifact });
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
});
