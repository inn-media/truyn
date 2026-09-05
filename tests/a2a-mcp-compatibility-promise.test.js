import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  A2A_MCP_COMPATIBILITY,
  A2A_MCP_COMPATIBILITY_GENERATION,
  assertCompatibilityRuntimeAlignment,
  negotiateA2aMcpCompatibility
} from '../adapters/compatibility/a2a-mcp.js';
import { validateA2aAgentCard } from '../adapters/a2a/client.js';
import { A2A_PROTOCOL_VERSION } from '../adapters/a2a/mapping.js';
import {
  A2A_INTEGRITY_METADATA_KEY,
  A2A_SOURCE_URL_METADATA_KEY,
  normalizeVerifiedRemotePart
} from '../adapters/a2a/artifact-integrity.js';
import {
  createMcpHandler,
  createMcpModernMeta,
  MCP_LEGACY_VERSIONS,
  MCP_MODERN_VERSION,
  MCP_SUPPORTED_VERSIONS
} from '../adapters/mcp/server.js';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';

function minimalAgentCard(protocolVersion = A2A_PROTOCOL_VERSION) {
  return {
    name: 'Compatibility fixture',
    description: 'A2A compatibility promise fixture',
    version: '1.0.0-test',
    supportedInterfaces: [{
      url: 'http://127.0.0.1:43210/a2a/jsonrpc',
      protocolBinding: 'JSONRPC',
      protocolVersion
    }],
    skills: [{
      id: 'echo',
      name: 'Echo',
      description: 'Compatibility echo',
      inputModes: ['text/plain'],
      outputModes: ['text/plain']
    }],
    futureOptionalHint: { display: 'ignored-by-current-client' }
  };
}

function expectCompatibilityError(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error?.code, code);
    assert.equal(error?.compatibility?.generation, A2A_MCP_COMPATIBILITY_GENERATION);
    return true;
  });
}

test('P2-E2 compatibility declaration stays aligned with runtime protocol constants', () => {
  assert.equal(assertCompatibilityRuntimeAlignment(), true);
  assert.equal(A2A_MCP_COMPATIBILITY.status, 'bounded-pre-v1');
  assert.equal(A2A_MCP_COMPATIBILITY.truyn.protocol, 'TRUYN/1');
  assert.equal(A2A_MCP_COMPATIBILITY.truyn.status, 'draft');
  assert.deepEqual(A2A_MCP_COMPATIBILITY.a2a.supportedProfiles, [A2A_PROTOCOL_VERSION]);
  assert.equal(MCP_CURRENT_PROTOCOL_VERSION, MCP_MODERN_VERSION);
  assert.deepEqual(A2A_MCP_COMPATIBILITY.mcp.facadeSupportedProfiles, [...MCP_SUPPORTED_VERSIONS]);
  assert.deepEqual(A2A_MCP_COMPATIBILITY.mcp.legacyFacadeProfiles, [...MCP_LEGACY_VERSIONS]);
});

test('P2-E2 A2A 1.0 supported profile executes negotiation and ignores unknown optional semantics', () => {
  const negotiated = negotiateA2aMcpCompatibility({
    protocol: 'a2a',
    version: A2A_PROTOCOL_VERSION,
    requiredSemantics: ['agent-card', 'send-message', 'get-task', 'bounded-artifact-mapping'],
    optionalSemantics: ['future-a2a-display-hint']
  });
  assert.equal(negotiated.version, '1.0');
  assert.deepEqual(negotiated.ignoredOptionalSemantics, ['future-a2a-display-hint']);

  const validated = validateA2aAgentCard(minimalAgentCard(), {
    cardUrl: 'http://127.0.0.1:43210/.well-known/agent-card.json'
  });
  assert.equal(validated.interface.protocolVersion, '1.0');
  assert.deepEqual(validated.card.futureOptionalHint, { display: 'ignored-by-current-client' });
});

test('P2-E2 unsupported A2A required version fails deterministically', () => {
  expectCompatibilityError(() => negotiateA2aMcpCompatibility({
    protocol: 'a2a',
    version: '2.0',
    requiredSemantics: ['agent-card']
  }), 'INTEROP_VERSION_UNSUPPORTED');

  assert.throws(
    () => validateA2aAgentCard(minimalAgentCard('2.0'), {
      cardUrl: 'http://127.0.0.1:43210/.well-known/agent-card.json'
    }),
    /A2A Agent Card does not declare JSONRPC 1\.0/
  );
});

test('P2-E2 MCP modern import profile and declared legacy facade profiles negotiate only where promised', () => {
  const modernImport = negotiateA2aMcpCompatibility({
    protocol: 'mcp',
    direction: 'import',
    version: MCP_CURRENT_PROTOCOL_VERSION,
    requiredSemantics: ['discovery', 'tools-list', 'tools-call', 'truyn-import-profile']
  });
  assert.equal(modernImport.version, '2026-07-28');

  for (const version of MCP_LEGACY_VERSIONS) {
    const legacyFacade = negotiateA2aMcpCompatibility({
      protocol: 'mcp',
      direction: 'facade',
      version,
      requiredSemantics: ['tools-list', 'tools-call', 'truyn-facade-profile']
    });
    assert.equal(legacyFacade.version, version);

    expectCompatibilityError(() => negotiateA2aMcpCompatibility({
      protocol: 'mcp',
      direction: 'import',
      version,
      requiredSemantics: ['tools-list']
    }), 'INTEROP_VERSION_UNSUPPORTED');
  }
});

test('P2-E2 MCP runtime returns explicit compatibility errors and accepts declared legacy initialize profiles', async () => {
  const handler = createMcpHandler({ node: { identity: { nodeId: 'compat-node', algorithm: 'Ed25519' } } });

  const discovered = await handler({
    jsonrpc: '2.0',
    id: 'discover',
    method: 'server/discover',
    params: { _meta: createMcpModernMeta({ clientName: 'compat-test', clientVersion: '1' }) }
  });
  assert.deepEqual(discovered.result.supportedVersions, [...MCP_SUPPORTED_VERSIONS]);

  for (const version of MCP_LEGACY_VERSIONS) {
    const initialized = await handler({
      jsonrpc: '2.0',
      id: `legacy-${version}`,
      method: 'initialize',
      params: {
        protocolVersion: version,
        capabilities: {},
        clientInfo: { name: 'compat-test', version: '1' }
      }
    });
    assert.equal(initialized.result.protocolVersion, version);
  }

  const unsupported = await handler({
    jsonrpc: '2.0',
    id: 'unsupported',
    method: 'initialize',
    params: {
      protocolVersion: '1999-01-01',
      capabilities: {},
      clientInfo: { name: 'compat-test', version: '1' }
    }
  });
  assert.equal(unsupported.error.code, -32022);
  assert.match(unsupported.error.message, /Unsupported protocol version/);
});

test('P2-E2 unknown required interoperability semantics fail closed', () => {
  expectCompatibilityError(() => negotiateA2aMcpCompatibility({
    protocol: 'mcp',
    direction: 'import',
    version: MCP_CURRENT_PROTOCOL_VERSION,
    requiredSemantics: ['tools-call', 'arbitrary-mcp-prompts']
  }), 'INTEROP_REQUIRED_SEMANTIC_UNSUPPORTED');
});

test('P2-E2 referenced artifact compatibility preserves the Sprint E integrity contract', async () => {
  const bytes = Buffer.from('TRUYN Sprint E interop proof\n', 'utf8');
  const digest = createHash('sha256').update(bytes).digest('hex');
  let resolverCalls = 0;
  const normalized = await normalizeVerifiedRemotePart({
    url: 'https://compatibility.invalid/interop-proof.bin',
    filename: 'interop-proof.bin',
    mediaType: 'application/octet-stream',
    metadata: {
      [A2A_INTEGRITY_METADATA_KEY]: {
        algorithm: 'sha256',
        digest,
        sizeBytes: bytes.length,
        encoding: 'raw'
      }
    }
  }, {
    maxArtifactBytes: 1024,
    resolveArtifactUrl: async ({ url }) => {
      resolverCalls += 1;
      assert.equal(url, 'https://compatibility.invalid/interop-proof.bin');
      return bytes;
    }
  });

  assert.equal(resolverCalls, 1);
  assert.equal(normalized.filename, 'interop-proof.bin');
  assert.equal(normalized.mediaType, 'application/octet-stream');
  assert.equal(normalized.raw, bytes.toString('base64'));
  assert.equal(normalized.metadata[A2A_SOURCE_URL_METADATA_KEY], 'https://compatibility.invalid/interop-proof.bin');
  assert.deepEqual(normalized.metadata[A2A_INTEGRITY_METADATA_KEY], {
    algorithm: 'sha256',
    digest,
    sizeBytes: bytes.length,
    encoding: 'raw',
    verified: true
  });
});

test('P2-E2 security-critical interoperability semantics are immutable within generation g1', () => {
  assert.deepEqual(A2A_MCP_COMPATIBILITY.immutableSecurityInvariants, [
    'correlation-semantics',
    'artifact-integrity-semantics',
    'authorization-boundary',
    'provider-ownership-authority',
    'billing-authority',
    'exactly-once-remote-execution'
  ]);
});
