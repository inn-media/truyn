import { A2A_PROTOCOL_VERSION } from '../a2a/mapping.js';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../mcp/client.js';
import { MCP_KNOWN_EXTENSION_IDS } from '../mcp/capabilities.js';
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
  'resources-list',
  'resources-templates-list',
  'resources-read',
  'resource-object-state-v1',
  'resource-subscriptions-listen-v1',
  'resource-update-explicit-reread-v1',
  'resource-provider-authority-correlation-v1',
  'prompts-list',
  'prompts-get',
  'prompt-object-v1',
  'prompt-list-subscriptions-listen-v1',
  'prompt-explicit-refresh-v1',
  'prompt-explicit-mrtr-v1',
  'prompt-untrusted-data-boundary-v1',
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
    promisedSurfaces: Object.freeze([
      'discovery',
      'tools/list',
      'tools/call',
      'TRUYN facade/import profile',
      'bounded general resource import -> TRUYN OBJECT/STATE',
      'bounded resource subscriptions/listen invalidation -> explicit reread',
      'bounded prompt import -> immutable TRUYN OBJECT snapshot',
      'bounded promptsListChanged invalidation -> explicit list/get refresh',
      'explicit-only prompt MRTR continuation',
      'bounded MCP Apps UI extension import'
    ]),
    importKnownSemantics: MCP_IMPORT_SEMANTICS,
    facadeKnownSemantics: MCP_FACADE_SEMANTICS,
    importKnownExtensions: MCP_KNOWN_EXTENSION_IDS,
    facadeKnownExtensions: Object.freeze([]),
    apps: Object.freeze({
      status: 'bounded-pre-v1-import-extension',
      direction: 'import-only',
      stableV1Declared: false,
      transportProfile: MCP_CURRENT_PROTOCOL_VERSION,
      extensionId: MCP_KNOWN_EXTENSION_IDS[0],
      upstreamSource: Object.freeze({
        package: '@modelcontextprotocol/ext-apps',
        version: '2.0.0',
        commit: '4cd427394755ee0964172df5760852aa053a5c99'
      }),
      toolMetadata: Object.freeze({
        resourceUriScheme: 'ui://',
        maxResourceUriBytes: 2048,
        maxUiMetadataBytes: 4096,
        visibility: Object.freeze(['model', 'app'])
      }),
      resource: Object.freeze({
        mimeType: 'text/html;profile=mcp-app',
        maxBytes: 512 * 1024,
        maxContents: 32,
        resolution: 'explicit-same-provider-only',
        implicitArbitraryUrlFetch: false
      }),
      trustBoundary: Object.freeze({
        classification: 'untrusted-presentation-data',
        authority: Object.freeze({
          authorization: false,
          providerSelection: false,
          billing: false,
          entitlement: false,
          execution: false
        })
      }),
      hostLifecycle: 'not-promised'
    })
  }),
  artifact: Object.freeze({
    profile: 'referenced-artifact-integrity-v1',
    preserves: Object.freeze(['mediaType', 'filename', 'sizeBytes', 'sha256', 'provenance']),
    resolution: 'explicit-only',
    implicitArbitraryUrlFetch: false
  }),
  immutableSecurityInvariants: SECURITY_INVARIANTS,
  excludedOptionalSurfaces: Object.freeze([
    'arbitrary-mcp-resource-publication',
    'arbitrary-mcp-prompts',
    'mcp-prompt-facade-publication',
    'mcp-prompt-completion',
    'mcp-apps-host-lifecycle',
    'mcp-apps-browser-sandbox-csp-enforcement',
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
      known: A2A_MCP_COMPATIBILITY.a2a.knownSemantics,
      knownExtensions: []
    };
  }
  if (protocol === 'mcp') {
    if (direction === 'import') {
      return {
        supported: A2A_MCP_COMPATIBILITY.mcp.importSupportedProfiles,
        known: A2A_MCP_COMPATIBILITY.mcp.importKnownSemantics,
        knownExtensions: A2A_MCP_COMPATIBILITY.mcp.importKnownExtensions
      };
    }
    if (direction === 'facade') {
      return {
        supported: A2A_MCP_COMPATIBILITY.mcp.facadeSupportedProfiles,
        known: A2A_MCP_COMPATIBILITY.mcp.facadeKnownSemantics,
        knownExtensions: A2A_MCP_COMPATIBILITY.mcp.facadeKnownExtensions
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
  optionalSemantics = [],
  requiredExtensions = [],
  optionalExtensions = []
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

  const normalizedRequiredExtensions = normalizeSemantics(requiredExtensions, 'requiredExtensions');
  const normalizedOptionalExtensions = normalizeSemantics(optionalExtensions, 'optionalExtensions');
  const knownExtensions = new Set(profile.knownExtensions || []);
  const unsupportedRequiredExtensions = normalizedRequiredExtensions.filter((extensionId) => !knownExtensions.has(extensionId));
  if (unsupportedRequiredExtensions.length > 0) {
    throw compatibilityError(
      'INTEROP_REQUIRED_EXTENSION_UNSUPPORTED',
      `Unsupported required ${normalizedProtocol.toUpperCase()} extensions: ${unsupportedRequiredExtensions.join(', ')}`,
      { protocol: normalizedProtocol, direction, version: normalizedVersion, unsupportedRequiredExtensions }
    );
  }

  return Object.freeze({
    generation: A2A_MCP_COMPATIBILITY_GENERATION,
    status: A2A_MCP_COMPATIBILITY_STATUS,
    protocol: normalizedProtocol,
    direction,
    version: normalizedVersion,
    requiredSemantics: Object.freeze(required),
    ignoredOptionalSemantics: Object.freeze(optional.filter((semantic) => !known.has(semantic))),
    requiredExtensions: Object.freeze(normalizedRequiredExtensions),
    ignoredOptionalExtensions: Object.freeze(normalizedOptionalExtensions.filter((extensionId) => !knownExtensions.has(extensionId)))
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
