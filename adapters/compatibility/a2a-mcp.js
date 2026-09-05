import { A2A_PROTOCOL_VERSION } from '../a2a/mapping.js';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../mcp/client.js';
import { MCP_LEGACY_VERSIONS, MCP_MODERN_VERSION, MCP_SUPPORTED_VERSIONS } from '../mcp/server.js';

export const A2A_MCP_COMPATIBILITY_GENERATION = 'a2a-mcp-pre-v1/g1';
export const A2A_MCP_COMPATIBILITY_STATUS = 'bounded-pre-v1';
export const TRUYN_INTEROP_PROTOCOL = 'TRUYN/1';
export const TRUYN_INTEROP_PROTOCOL_STATUS = 'draft';

const SECURITY_INVARIANTS = Object.freeze([
  'correlation-semantics',
  'artifact-integrity-semantics',
  'authorization-boundary',
  'provider-ownership-authority',
  'billing-authority',
  'exactly-once-remote-execution'
]);

const A2A_SEMANTICS = Object.freeze([
  'agent-card',
  'send-message',
  'get-task',
  'bounded-artifact-mapping',
  'referenced-artifact-integrity-v1',
  ...SECURITY_INVARIANTS
]);

const MCP_IMPORT_SEMANTICS = Object.freeze([
  'discovery',
  'tools-list',
  'tools-call',
  'truyn-import-profile',
  'referenced-artifact-integrity-v1',
  ...SECURITY_INVARIANTS
]);

const MCP_FACADE_SEMANTICS = Object.freeze([
  'discovery',
  'tools-list',
  'tools-call',
  'truyn-facade-profile',
  ...SECURITY_INVARIANTS
]);

export const A2A_MCP_COMPATIBILITY = Object.freeze({
  generation: A2A_MCP_COMPATIBILITY_GENERATION,
  status: A2A_MCP_COMPATIBILITY_STATUS,
  truyn: Object.freeze({
    protocol: TRUYN_INTEROP_PROTOCOL,
    status: TRUYN_INTEROP_PROTOCOL_STATUS
  }),
  a2a: Object.freeze({
    testedProfiles: Object.freeze([A2A_PROTOCOL_VERSION]),
    supportedProfiles: Object.freeze([A2A_PROTOCOL_VERSION]),
    protocolBinding: 'JSONRPC',
    promisedSurfaces: Object.freeze(['Agent Card', 'SendMessage', 'GetTask', 'bounded Artifact mapping']),
    knownSemantics: A2A_SEMANTICS
  }),
  mcp: Object.freeze({
    testedProfile: MCP_CURRENT_PROTOCOL_VERSION,
    importSupportedProfiles: Object.freeze([MCP_CURRENT_PROTOCOL_VERSION]),
    facadeSupportedProfiles: Object.freeze([...MCP_SUPPORTED_VERSIONS]),
    legacyFacadeProfiles: Object.freeze([...MCP_LEGACY_VERSIONS]),
    promisedSurfaces: Object.freeze(['discovery', 'tools/list', 'tools/call', 'TRUYN facade/import profile']),
    importKnownSemantics: MCP_IMPORT_SEMANTICS,
    facadeKnownSemantics: MCP_FACADE_SEMANTICS
  }),
  artifact: Object.freeze({
    profile: 'referenced-artifact-integrity-v1',
    preserves: Object.freeze(['mediaType', 'filename', 'sizeBytes', 'sha256', 'provenance']),
    resolution: 'explicit-only',
    implicitArbitraryUrlFetch: false
  }),
  immutableSecurityInvariants: SECURITY_INVARIANTS,
  excludedOptionalSurfaces: Object.freeze([
    'arbitrary-mcp-resources',
    'arbitrary-mcp-prompts',
    'mcp-apps-extensions',
    'full-a2a-streaming-semantic-parity',
    'full-a2a-push-semantic-parity'
  ])
});

function compatibilityError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.compatibility = {
    generation: A2A_MCP_COMPATIBILITY_GENERATION,
    ...details
  };
  return error;
}

function normalizeSemantics(value, name) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return [...new Set(value.map((entry) => String(entry).trim()).filter(Boolean))];
}

function profileFor(protocol, direction) {
  if (protocol === 'a2a') {
    return {
      supported: A2A_MCP_COMPATIBILITY.a2a.supportedProfiles,
      known: A2A_MCP_COMPATIBILITY.a2a.knownSemantics
    };
  }
  if (protocol === 'mcp') {
    if (direction === 'import') {
      return {
        supported: A2A_MCP_COMPATIBILITY.mcp.importSupportedProfiles,
        known: A2A_MCP_COMPATIBILITY.mcp.importKnownSemantics
      };
    }
    if (direction === 'facade') {
      return {
        supported: A2A_MCP_COMPATIBILITY.mcp.facadeSupportedProfiles,
        known: A2A_MCP_COMPATIBILITY.mcp.facadeKnownSemantics
      };
    }
    throw compatibilityError('INTEROP_DIRECTION_UNSUPPORTED', `Unsupported MCP compatibility direction: ${direction}`, { protocol, direction });
  }
  throw compatibilityError('INTEROP_PROTOCOL_UNSUPPORTED', `Unsupported interoperability protocol: ${protocol}`, { protocol, direction });
}

export function negotiateA2aMcpCompatibility({
  protocol,
  direction = protocol === 'mcp' ? 'import' : 'bidirectional',
  version,
  requiredSemantics = [],
  optionalSemantics = []
} = {}) {
  const normalizedProtocol = String(protocol || '').trim().toLowerCase();
  const normalizedVersion = String(version || '').trim();
  if (!normalizedVersion) {
    throw compatibilityError('INTEROP_VERSION_REQUIRED', 'Interoperability protocol version is required', {
      protocol: normalizedProtocol || null,
      direction
    });
  }

  const profile = profileFor(normalizedProtocol, direction);
  if (!profile.supported.includes(normalizedVersion)) {
    throw compatibilityError(
      'INTEROP_VERSION_UNSUPPORTED',
      `Unsupported ${normalizedProtocol.toUpperCase()} compatibility version: ${normalizedVersion}`,
      { protocol: normalizedProtocol, direction, version: normalizedVersion, supported: [...profile.supported] }
    );
  }

  const required = normalizeSemantics(requiredSemantics, 'requiredSemantics');
  const optional = normalizeSemantics(optionalSemantics, 'optionalSemantics');
  const known = new Set(profile.known);
  const unsupportedRequired = required.filter((semantic) => !known.has(semantic));
  if (unsupportedRequired.length > 0) {
    throw compatibilityError(
      'INTEROP_REQUIRED_SEMANTIC_UNSUPPORTED',
      `Unsupported required interoperability semantics: ${unsupportedRequired.join(', ')}`,
      { protocol: normalizedProtocol, direction, version: normalizedVersion, unsupportedRequired }
    );
  }

  return Object.freeze({
    generation: A2A_MCP_COMPATIBILITY_GENERATION,
    status: A2A_MCP_COMPATIBILITY_STATUS,
    protocol: normalizedProtocol,
    direction,
    version: normalizedVersion,
    requiredSemantics: Object.freeze(required),
    ignoredOptionalSemantics: Object.freeze(optional.filter((semantic) => !known.has(semantic)))
  });
}

export function assertCompatibilityRuntimeAlignment() {
  if (MCP_CURRENT_PROTOCOL_VERSION !== MCP_MODERN_VERSION) {
    throw compatibilityError('INTEROP_RUNTIME_DRIFT', 'MCP import/current and modern server protocol versions diverged', {
      client: MCP_CURRENT_PROTOCOL_VERSION,
      server: MCP_MODERN_VERSION
    });
  }
  if (A2A_MCP_COMPATIBILITY.a2a.supportedProfiles.length !== 1 || A2A_MCP_COMPATIBILITY.a2a.supportedProfiles[0] !== A2A_PROTOCOL_VERSION) {
    throw compatibilityError('INTEROP_RUNTIME_DRIFT', 'A2A declared compatibility profile diverged from runtime', {
      runtime: A2A_PROTOCOL_VERSION
    });
  }
  if (A2A_MCP_COMPATIBILITY.mcp.facadeSupportedProfiles.join('\n') !== MCP_SUPPORTED_VERSIONS.join('\n')) {
    throw compatibilityError('INTEROP_RUNTIME_DRIFT', 'MCP declared facade compatibility range diverged from runtime', {
      runtime: [...MCP_SUPPORTED_VERSIONS]
    });
  }
  return true;
}
