import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION,
  TRUYN_MANAGED_CLIENT_PLATFORMS,
  TruynClient,
  TruynError,
  TruynManagedAuthContractError,
  agentDescriptorSigningPayload,
  negotiateAgentDescriptor,
  normalizeError,
  parseAgentDescriptor,
  parseTruynManagedDeviceRegistrationRequest,
  parseTruynManagedSessionRevocationRequest,
  verifyAgentDescriptorSignature
} from '../src/index.ts';
import type { AgentDescriptor } from '../src/index.ts';

const goldenUrl = new URL('../../conformance/v1/golden-fixtures.json', import.meta.url);
const runtimeUrl = new URL('../../conformance/v1/agent-descriptor-runtime-fixtures.json', import.meta.url);
const [golden, runtime] = await Promise.all([
  readFile(goldenUrl, 'utf8').then(JSON.parse),
  readFile(runtimeUrl, 'utf8').then(JSON.parse)
]);

function runtimeCase(id: string): any {
  const entry = runtime.descriptorRuntimeCases.find((item: any) => item.id === id);
  assert.ok(entry, `missing runtime fixture ${id}`);
  return entry;
}

function descriptorFor(entry: any): AgentDescriptor {
  if (entry.value) return structuredClone(entry.value) as AgentDescriptor;
  if (entry.valueFrom) return descriptorFor(runtimeCase(entry.valueFrom));
  throw new Error(`fixture ${entry.id} has no descriptor value`);
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('TypeScript SDK consumes the same shared fixture set and error mappings', () => {
  assert.equal(golden.fixtureSet, 'truyn.sdk-conformance/v1');
  assert.equal(runtime.fixtureSet, golden.fixtureSet);
  assert.equal(runtime.contractVersion, golden.contractVersion);

  for (const entry of golden.errorNormalizationCases) {
    const actual = normalizeError(entry.source);
    assert.equal(actual.code, entry.expect.code, `${entry.id} code`);
    assert.equal(actual.retryable, entry.expect.retryable, `${entry.id} retryable`);
  }
});

test('TypeScript Agent Descriptor surface delegates to the PR2 canonical/signature contract', () => {
  const entry = runtimeCase('descriptor.signature-valid');
  const descriptor = descriptorFor(entry);
  assert.equal(agentDescriptorSigningPayload(descriptor), entry.canonicalSigningPayload);

  const verified = verifyAgentDescriptorSignature(descriptor, {
    publicKeyPem: entry.identityPublicKey,
    now: entry.now
  });
  assert.equal(verified.ok, true);
  if (!verified.ok) return;
  assert.equal(verified.signer.keyBinding, entry.expect.keyBinding);

  const negotiated = negotiateAgentDescriptor(descriptor, {
    now: entry.now,
    supportedProtocols: ['TRUYN/1'],
    supportedInterfaces: ['https']
  });
  assert.equal(negotiated.ok, true);
  if (negotiated.ok) {
    assert.equal(negotiated.selection.protocol, 'TRUYN/1');
    assert.equal(negotiated.selection.interface.type, 'https');
  }
});

test('TypeScript descriptor verification rejects shared negative crypto/version vectors', () => {
  const tampered = runtimeCase('descriptor.signature-tampered');
  const tamperedResult = verifyAgentDescriptorSignature(descriptorFor(tampered), {
    publicKeyPem: tampered.identityPublicKey,
    now: tampered.now
  });
  assert.equal(tamperedResult.ok, false);
  if (!tamperedResult.ok) {
    assert.equal(tamperedResult.reason, tampered.expect.reason);
    assert.equal(tamperedResult.error.code, tampered.expect.error.code);
  }

  const wrongKey = runtimeCase('descriptor.identity-key-mismatch');
  const wrongKeyResult = verifyAgentDescriptorSignature(descriptorFor(wrongKey), {
    publicKeyPem: wrongKey.identityPublicKey,
    now: wrongKey.now
  });
  assert.equal(wrongKeyResult.ok, false);
  if (!wrongKeyResult.ok) assert.equal(wrongKeyResult.reason, wrongKey.expect.reason);

  const descriptorVersion = golden.behaviorCases.find((item: any) => item.id === 'descriptor.version-mismatch');
  const parsed = parseAgentDescriptor(descriptorVersion.value, { now: '2026-08-25T12:00:00.000Z' });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.equal(parsed.error.code, 'version_mismatch');
});

test('identity retrieval and discovery use authenticated existing relay APIs without client-side visibility expansion', async () => {
  const privacy = golden.behaviorCases.find((item: any) => item.id === 'discovery.private-capability-nondisclosure');
  const nodeId = 'truyn:node:provider-public-001';
  const calls: Array<{ url: string; authorization: string | null }> = [];

  const fetchMock: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, authorization: headers.get('authorization') });
    if (url.includes('/v1/nodes/')) return jsonResponse({ nodeId, publicKey: 'FIXTURE_PUBLIC_KEY' });
    if (url.includes('/v1/offers?')) return jsonResponse(privacy.wireResponse);
    return jsonResponse({ error: 'not_found' }, 404);
  };

  const client = new TruynClient({ relayUrl: 'https://relay.example/', sessionToken: 'session-1', fetch: fetchMock });
  const identity = await client.getIdentity(nodeId);
  assert.deepEqual(identity, { nodeId, publicKey: 'FIXTURE_PUBLIC_KEY' });

  const offers = await client.discover('reasoning.general');
  assert.deepEqual(offers.map((offer) => offer.id), privacy.expect.visibleOfferIds);
  for (const hiddenId of privacy.expect.absentOfferIds) {
    assert.equal(offers.some((offer) => offer.id === hiddenId), false, `${hiddenId} leaked into SDK discovery`);
  }
  assert.ok(calls.length >= 2);
  for (const call of calls) assert.equal(call.authorization, 'Bearer session-1');
});

test('fetchAgentDescriptor composes HTTP retrieval, relay identity resolution, PR2 verification and negotiation', async () => {
  const entry = runtimeCase('descriptor.signature-valid');
  const descriptor = descriptorFor(entry);
  const calls: string[] = [];

  const fetchMock: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://fixture.example/.well-known/truyn-agent.json') return jsonResponse(descriptor);
    if (url.includes('/v1/nodes/')) {
      return jsonResponse({ nodeId: descriptor.identity, publicKey: entry.identityPublicKey });
    }
    return jsonResponse({ error: 'not_found' }, 404);
  };

  const client = new TruynClient({ relayUrl: 'https://relay.example', sessionToken: 'session-1', fetch: fetchMock });
  const result = await client.fetchAgentDescriptor('https://fixture.example/.well-known/truyn-agent.json', {
    now: entry.now,
    supportedProtocols: ['TRUYN/2', 'TRUYN/1'],
    supportedInterfaces: ['mcp', 'https']
  });

  assert.equal(result.descriptor.identity, descriptor.identity);
  assert.equal(result.signer.keyBinding, 'identity');
  assert.equal(result.selection.protocol, 'TRUYN/1');
  assert.equal(result.selection.interface.type, 'https');
  assert.equal(calls.length, 2);
});

test('relay and transport failures surface as shared TruynError taxonomy', async () => {
  const unauthorizedFetch: typeof fetch = async () => jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  const unauthorized = new TruynClient({ relayUrl: 'https://relay.example', sessionToken: 'bad', fetch: unauthorizedFetch });
  await assert.rejects(
    () => unauthorized.discover('reasoning.general'),
    (error: unknown) => error instanceof TruynError && error.code === 'unauthenticated' && error.retryable === false
  );

  const transportFetch: typeof fetch = async () => { throw new Error('socket closed'); };
  const transport = new TruynClient({ relayUrl: 'https://relay.example', sessionToken: 'session', fetch: transportFetch });
  await assert.rejects(
    () => transport.getIdentity('truyn:node:any'),
    (error: unknown) => error instanceof TruynError && error.code === 'transport_error' && error.retryable === true
  );
});

test('managed auth/device contract is versioned and limited to four released client platforms', () => {
  assert.equal(TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION, 'truyn.managed-auth-device/v1');
  assert.deepEqual(TRUYN_MANAGED_CLIENT_PLATFORMS, ['windows', 'macos', 'linux', 'android']);
});

test('managed device registration accepts only bounded client-writable fields', () => {
  assert.deepEqual(
    parseTruynManagedDeviceRegistrationRequest({
      contractVersion: TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION,
      clientDeviceId: 'desktop-installation-1',
      platform: 'windows',
      clientVersion: '1.0.0'
    }),
    {
      contractVersion: TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION,
      clientDeviceId: 'desktop-installation-1',
      platform: 'windows',
      clientVersion: '1.0.0'
    }
  );
});

test('managed device registration rejects client-supplied authority before transport', () => {
  for (const field of ['accountId', 'tenantId', 'deviceId', 'sessionId']) {
    assert.throws(
      () => parseTruynManagedDeviceRegistrationRequest({
        contractVersion: TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION,
        clientDeviceId: 'android-installation-1',
        platform: 'android',
        [field]: 'attacker-selected-value'
      }),
      (error: unknown) => error instanceof TruynManagedAuthContractError
        && error.code === 'managed_auth_contract_violation'
        && error.reason === 'server_authoritative_field'
    );
  }
});

test('managed auth/device contract fails closed on incompatible or unknown input', () => {
  assert.throws(
    () => parseTruynManagedDeviceRegistrationRequest({
      contractVersion: 'truyn.managed-auth-device/v2',
      clientDeviceId: 'mac-installation-1',
      platform: 'macos'
    }),
    (error: unknown) => error instanceof TruynManagedAuthContractError && error.reason === 'version_mismatch'
  );

  assert.throws(
    () => parseTruynManagedDeviceRegistrationRequest({
      contractVersion: TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION,
      clientDeviceId: 'other-installation-1',
      platform: 'ios'
    }),
    (error: unknown) => error instanceof TruynManagedAuthContractError && error.reason === 'unsupported_platform'
  );

  assert.throws(
    () => parseTruynManagedDeviceRegistrationRequest({
      contractVersion: TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION,
      clientDeviceId: 'desktop-installation-2',
      platform: 'windows',
      arbitraryPrivilege: true
    }),
    (error: unknown) => error instanceof TruynManagedAuthContractError && error.reason === 'invalid_request'
  );
});

test('managed session revocation remains self-scoped', () => {
  for (const scope of ['current_session', 'current_device', 'all_sessions']) {
    assert.deepEqual(
      parseTruynManagedSessionRevocationRequest({
        contractVersion: TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION,
        scope
      }),
      { contractVersion: TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION, scope }
    );
  }

  assert.throws(
    () => parseTruynManagedSessionRevocationRequest({
      contractVersion: TRUYN_MANAGED_AUTH_DEVICE_CONTRACT_VERSION,
      scope: 'all_sessions',
      accountId: 'another-account'
    }),
    (error: unknown) => error instanceof TruynManagedAuthContractError && error.reason === 'server_authoritative_field'
  );
});
