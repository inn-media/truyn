import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../sdk/conformance/v1/sdk-contract.schema.json', import.meta.url);
const fixturesUrl = new URL('../sdk/conformance/v1/golden-fixtures.json', import.meta.url);
const protocolUrl = new URL('../core/protocol/index.js', import.meta.url);
const nodeClientUrl = new URL('../node/client.js', import.meta.url);
const relayUrl = new URL('../network/relay/server.js', import.meta.url);
const descriptorSpecUrl = new URL('../spec/protocol/v1/agent-descriptor.md', import.meta.url);

const [schema, fixtures, protocolSource, nodeClientSource, relaySource, descriptorSpec] = await Promise.all([
  readFile(schemaUrl, 'utf8').then(JSON.parse),
  readFile(fixturesUrl, 'utf8').then(JSON.parse),
  readFile(protocolUrl, 'utf8'),
  readFile(nodeClientUrl, 'utf8'),
  readFile(relayUrl, 'utf8'),
  readFile(descriptorSpecUrl, 'utf8')
]);

const requiredDtos = [
  'Identity',
  'AgentDescriptor',
  'Capability',
  'Offer',
  'Need',
  'Result',
  'ArtifactRef',
  'NormalizedError'
];

const normalizedErrorCodes = new Set(schema.$defs.NormalizedError.properties.code.enum);
const envelopeFields = ['protocol', 'type', 'id', 'from', 'to', 'createdAt', 'publicKey', 'payload', 'signature'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function validateEnvelope(value, expectedType) {
  return Boolean(
    value &&
    value.protocol === 'TRUYN/1' &&
    value.type === expectedType &&
    envelopeFields.every((field) => Object.hasOwn(value, field)) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.from) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.publicKey) &&
    isNonEmptyString(value.signature) &&
    value.payload && typeof value.payload === 'object'
  );
}

function validateDto(dto, value) {
  if (dto === 'Identity') {
    return Boolean(
      value &&
      isNonEmptyString(value.nodeId) &&
      value.nodeId.startsWith('truyn:node:') &&
      isNonEmptyString(value.publicKey)
    );
  }
  if (dto === 'Capability') return Boolean(value && isNonEmptyString(value.id));
  if (dto === 'ArtifactRef') return isNonEmptyString(value);
  if (dto === 'NormalizedError') {
    return Boolean(
      value &&
      normalizedErrorCodes.has(value.code) &&
      isNonEmptyString(value.message) &&
      typeof value.retryable === 'boolean'
    );
  }
  if (dto === 'AgentDescriptor') {
    return Boolean(
      value &&
      value.schema === 'truyn.agent-descriptor/v1' &&
      value.descriptorVersion === '1' &&
      isNonEmptyString(value.identity) &&
      Array.isArray(value.protocols) && value.protocols.length > 0 &&
      Array.isArray(value.interfaces) && value.interfaces.length > 0 &&
      Array.isArray(value.capabilities) &&
      isNonEmptyString(value.issuedAt) &&
      isNonEmptyString(value.expiresAt) &&
      (isNonEmptyString(value.signature) || (Array.isArray(value.signatures) && value.signatures.length > 0))
    );
  }
  if (dto === 'Offer') {
    return Boolean(
      validateEnvelope(value, 'OFFER') &&
      isNonEmptyString(value.payload?.capability?.name) &&
      value.payload?.metadata &&
      typeof value.payload.metadata === 'object'
    );
  }
  if (dto === 'Need') {
    return Boolean(
      validateEnvelope(value, 'NEED') &&
      isNonEmptyString(value.payload?.capability?.name) &&
      Object.hasOwn(value.payload, 'input') &&
      value.payload?.policy &&
      typeof value.payload.policy === 'object'
    );
  }
  if (dto === 'Result') {
    return Boolean(
      validateEnvelope(value, 'RESULT') &&
      isNonEmptyString(value.payload?.requestId) &&
      Object.hasOwn(value.payload, 'output') &&
      isNonEmptyString(value.payload?.completedAt) &&
      value.payload?.metadata &&
      typeof value.payload.metadata === 'object'
    );
  }
  return false;
}

test('shared SDK contract declares every DX-1 foundational DTO', () => {
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  for (const dto of requiredDtos) assert.ok(schema.$defs[dto], `missing $defs.${dto}`);
  assert.equal(schema.$defs.SignedEnvelopeBase.properties.protocol.const, 'TRUYN/1');
});

test('one fixture set covers every DTO in both polarities with globally unique case ids', () => {
  assert.equal(fixtures.fixtureSet, 'truyn.sdk-conformance/v1');
  assert.equal(fixtures.protocol, 'TRUYN/1');

  const allCases = [
    ...fixtures.dtoCases,
    ...fixtures.behaviorCases,
    ...fixtures.errorNormalizationCases
  ];
  const ids = allCases.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'fixture ids must be unique');

  for (const dto of requiredDtos) {
    for (const polarity of ['positive', 'negative']) {
      assert.ok(
        fixtures.dtoCases.some((entry) => entry.dto === dto && entry.polarity === polarity),
        `missing ${polarity} fixture for ${dto}`
      );
    }
  }
});

test('positive and negative DTO fixtures agree with the shared minimum contract', () => {
  for (const entry of fixtures.dtoCases) {
    const actual = validateDto(entry.dto, entry.value);
    assert.equal(actual, entry.expect.valid, `${entry.id} validity mismatch`);
  }
});

test('OFFER NEED and RESULT fixtures preserve the existing signed envelope and payload mapping', () => {
  const offer = fixtures.dtoCases.find((entry) => entry.id === 'offer.signed.valid').value;
  const need = fixtures.dtoCases.find((entry) => entry.id === 'need.signed.valid').value;
  const result = fixtures.dtoCases.find((entry) => entry.id === 'result.signed.valid').value;

  assert.deepEqual(Object.keys(offer).sort(), envelopeFields.slice().sort());
  assert.deepEqual(Object.keys(need).sort(), envelopeFields.slice().sort());
  assert.deepEqual(Object.keys(result).sort(), envelopeFields.slice().sort());
  assert.equal(offer.payload.capability.name, 'reasoning.general');
  assert.equal(need.payload.capability.name, 'reasoning.general');
  assert.equal(result.payload.requestId, need.id);
});

test('shared mapping is anchored to current protocol, node client, relay and descriptor sources', () => {
  assert.match(protocolSource, /export const PROTOCOL = 'TRUYN\/1';/);
  for (const type of ['IDENTITY', 'OFFER', 'NEED', 'RESULT', 'REVOKE']) {
    assert.ok(protocolSource.includes(`'${type}'`), `protocol source no longer declares ${type}`);
  }
  assert.match(
    protocolSource,
    /const unsigned = \{\s*protocol: PROTOCOL,\s*type,\s*id,\s*from,\s*to,\s*createdAt,\s*publicKey: publicKeyPem,\s*payload\s*\};/s
  );
  assert.match(protocolSource, /return \{ \.\.\.unsigned, signature \};/);

  for (const route of ['/v1/register', '/v1/nodes/', '/v1/offers', '/v1/needs', '/v1/results']) {
    assert.ok(nodeClientSource.includes(route), `node client mapping lost ${route}`);
  }
  assert.ok(nodeClientSource.includes('capability: { name: capability }'));

  assert.ok(relaySource.includes('providerPolicyAllowsRequester'));
  assert.ok(relaySource.includes('matchingOffers({ capability, requesterNodeId })'));
  assert.match(relaySource, /\.map\(\(offer\) => \(\{ \.\.\.offer\.envelope, trust: trustFor\(offer\.envelope\.from\) \}\)\)/);

  assert.ok(descriptorSpec.includes('truyn.agent-descriptor/v1'));
  assert.ok(descriptorSpec.includes('descriptorVersion'));
  assert.ok(descriptorSpec.includes('MUST NOT reveal a private capability/provider'));
  assert.ok(descriptorSpec.includes('Clients MUST inspect `descriptorVersion` and `protocols`'));
});

test('ArtifactRef remains opaque and does not invent a generic artifact wire object', () => {
  assert.equal(schema.$defs.ArtifactRef.type, 'string');
  const fixture = fixtures.dtoCases.find((entry) => entry.id === 'artifact-ref.context.valid');
  assert.equal(typeof fixture.value, 'string');
  assert.equal(fixture.expect.opaque, true);
});

test('private capability non-disclosure is represented at the server-to-SDK boundary', () => {
  const entry = fixtures.behaviorCases.find((item) => item.id === 'discovery.private-capability-nondisclosure');
  const serverOfferIds = new Set(entry.serverSideOnly.offers.map((offer) => offer.id));
  const wireOfferIds = new Set(entry.wireResponse.offers.map((offer) => offer.id));
  const wireProviderIds = new Set(entry.wireResponse.offers.map((offer) => offer.from));

  for (const id of entry.expect.visibleOfferIds) assert.ok(wireOfferIds.has(id), `visible offer ${id} missing`);
  for (const id of entry.expect.absentOfferIds) {
    assert.ok(serverOfferIds.has(id), `hidden offer ${id} must exist only in server fixture state`);
    assert.equal(wireOfferIds.has(id), false, `hidden offer ${id} leaked into SDK-facing response`);
  }
  for (const nodeId of entry.expect.hiddenProviderNodeIds) {
    assert.equal(wireProviderIds.has(nodeId), false, `hidden provider ${nodeId} leaked`);
  }
});

test('unsupported descriptor and protocol versions fail explicitly as version_mismatch', () => {
  const descriptor = fixtures.behaviorCases.find((item) => item.id === 'descriptor.version-mismatch');
  assert.notEqual(descriptor.value.descriptorVersion, '1');
  assert.equal(descriptor.expect.accepted, false);
  assert.equal(descriptor.expect.error.code, 'version_mismatch');
  assert.equal(descriptor.expect.error.retryable, false);

  const protocol = fixtures.behaviorCases.find((item) => item.id === 'protocol.version-mismatch');
  assert.notEqual(protocol.value.protocol, 'TRUYN/1');
  assert.equal(protocol.expect.accepted, false);
  assert.equal(protocol.expect.protocolReason, 'unsupported_protocol');
  assert.equal(protocol.expect.error.code, 'version_mismatch');
  assert.equal(protocol.expect.error.source.protocolReason, 'unsupported_protocol');
});

test('representative relay, protocol and client failures normalize identically across SDKs', () => {
  assert.ok(Array.isArray(fixtures.errorNormalizationCases));
  assert.ok(fixtures.errorNormalizationCases.length >= 8);

  for (const entry of fixtures.errorNormalizationCases) {
    assert.ok(normalizedErrorCodes.has(entry.expect.code), `${entry.id} targets unknown normalized code`);
    assert.equal(typeof entry.expect.retryable, 'boolean', `${entry.id} must define retryable`);

    const source = entry.source || {};
    assert.ok(
      source.protocolReason || source.relayCode || source.clientKind,
      `${entry.id} must carry a source discriminator`
    );
    if (source.protocolReason) {
      assert.ok(protocolSource.includes(`'${source.protocolReason}'`), `${entry.id} protocol reason drifted from runtime`);
    }
    if (source.relayCode) {
      assert.ok(relaySource.includes(`'${source.relayCode}'`), `${entry.id} relay code drifted from runtime`);
    }
  }

  const protocolMismatch = fixtures.errorNormalizationCases.find(
    (entry) => entry.id === 'error-map.protocol.unsupported-protocol'
  );
  assert.equal(protocolMismatch.expect.code, 'version_mismatch');

  const unauthorized = fixtures.errorNormalizationCases.find(
    (entry) => entry.id === 'error-map.http.unauthorized'
  );
  assert.equal(unauthorized.expect.code, 'unauthenticated');

  const timeout = fixtures.errorNormalizationCases.find(
    (entry) => entry.id === 'error-map.http.result-wait-timeout'
  );
  assert.equal(timeout.expect.code, 'deadline_exceeded');
  assert.equal(timeout.expect.retryable, true);
});

test('normalized errors are SDK-only, finite and preserve safe raw source details', () => {
  assert.ok(normalizedErrorCodes.has('version_mismatch'));
  assert.ok(normalizedErrorCodes.has('permission_denied'));
  assert.ok(normalizedErrorCodes.has('deadline_exceeded'));
  assert.equal(normalizedErrorCodes.has('made_up_error'), false);

  const fixture = fixtures.dtoCases.find((entry) => entry.id === 'error.version-mismatch.valid').value;
  assert.equal(fixture.source.protocolReason, 'unsupported_protocol');
});
