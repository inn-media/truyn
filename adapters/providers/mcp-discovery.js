import { createMcpHttpClient, analyzeMcpToolDefinition, MCP_CURRENT_PROTOCOL_VERSION, MCP_SERVER_INFO_META_KEY } from '../mcp/client.js';
import { createMcpResourceHttpClient } from '../mcp/resources-client.js';
import { hasMcpUiExtensionCapability, MCP_UI_EXTENSION_ID } from '../mcp/capabilities.js';
import { normalizeMcpAppsResourceUri, parseMcpAppsToolMetadata } from '../mcp/apps-metadata.js';
import { MCP_APPS_UI_TRUST_BOUNDARY, validateMcpAppsResourceReadResult } from '../mcp/apps-resource.js';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAllowTools(allowTools) {
  if (allowTools === undefined || allowTools === null) return new Set();
  if (!Array.isArray(allowTools)) throw new Error('allowTools must be an array of exact MCP tool names');
  return new Set(allowTools.map((value) => String(value).trim()).filter(Boolean));
}

function defaultCapabilityName(tool, prefix) {
  return `${prefix}${tool.name}`;
}

function analyzeImportableTool(tool) {
  if (isObject(tool?.inputSchema) && Object.prototype.hasOwnProperty.call(tool.inputSchema, 'x-mcp-header')) {
    return { ok: false, reason: 'x-mcp-header is not statically reachable through properties' };
  }
  return analyzeMcpToolDefinition(tool);
}

function analyzeAppsToolMetadata(tool, uiExtensionDeclared) {
  const meta = tool?._meta;
  if (!isObject(meta)) return { ok: true, appsMetadata: null };

  if (Object.prototype.hasOwnProperty.call(meta, 'ui/resourceUri')) {
    return { ok: false, reason: 'legacy MCP Apps _meta["ui/resourceUri"] is not accepted; use _meta.ui.resourceUri' };
  }

  if (!Object.prototype.hasOwnProperty.call(meta, 'ui')) {
    return { ok: true, appsMetadata: null };
  }
  if (!uiExtensionDeclared) {
    return {
      ok: false,
      reason: `MCP Apps _meta.ui requires explicit ${MCP_UI_EXTENSION_ID} server extension capability`
    };
  }

  try {
    return { ok: true, appsMetadata: parseMcpAppsToolMetadata(meta) };
  } catch (error) {
    return { ok: false, reason: error?.message || 'Invalid MCP Apps tool metadata' };
  }
}

function isAppOnlyTool(appsMetadata) {
  return appsMetadata?.declared === true
    && appsMetadata.visibility.length === 1
    && appsMetadata.visibility[0] === 'app';
}

function resourceBindingKey(providerAuthority, resourceUri) {
  return JSON.stringify([providerAuthority, resourceUri]);
}

function toolResourceBindingKey(providerAuthority, tool, resourceUri) {
  return JSON.stringify([providerAuthority, tool, resourceUri]);
}

function authorityMismatchError(expected, received) {
  const error = new Error(`MCP Apps UI resource provider authority mismatch: expected ${expected}, received ${received}`);
  error.code = 'MCP_APPS_PROVIDER_AUTHORITY_MISMATCH';
  error.appResource = Object.freeze({ expectedProviderAuthority: expected, receivedProviderAuthority: received });
  return error;
}

function undeclaredResourceError(providerAuthority, resourceUri) {
  const error = new Error(
    `MCP Apps UI resource was not declared by selected MCP tool metadata for provider ${providerAuthority}: ${resourceUri}`
  );
  error.code = 'MCP_APPS_RESOURCE_UNDECLARED';
  error.appResource = Object.freeze({ providerAuthority, resourceUri });
  return error;
}

function toolResultLinkError(message, details = {}) {
  const error = new Error(message);
  error.code = 'MCP_APPS_TOOL_RESULT_RESOURCE_UNBOUND';
  error.appResource = Object.freeze({ ...details });
  return error;
}

function normalizeBoundResourceReference(value, providerAuthority) {
  if (typeof value === 'string') {
    return Object.freeze({
      providerAuthority,
      resourceUri: normalizeMcpAppsResourceUri(value)
    });
  }
  if (!isObject(value)) {
    const error = new Error('MCP Apps UI resource resolution requires a resource URI or provider-bound reference');
    error.code = 'MCP_APPS_RESOURCE_REFERENCE_INVALID';
    throw error;
  }
  if (typeof value.providerAuthority !== 'string' || !value.providerAuthority) {
    const error = new Error('MCP Apps UI resource reference requires providerAuthority');
    error.code = 'MCP_APPS_RESOURCE_REFERENCE_INVALID';
    throw error;
  }
  if (value.providerAuthority !== providerAuthority) {
    throw authorityMismatchError(providerAuthority, value.providerAuthority);
  }
  return Object.freeze({
    providerAuthority,
    resourceUri: normalizeMcpAppsResourceUri(value.resourceUri)
  });
}

export async function createMcpDiscoveryProvider({
  endpoint,
  apiKey,
  authMode,
  allowTools,
  filter,
  capabilityPrefix = 'mcp.',
  mapCapability,
  maxPages = 16,
  maxTools = 512,
  requestTimeoutMs,
  fetchImpl = fetch
} = {}) {
  const allowed = normalizeAllowTools(allowTools);
  if (allowed.size === 0 && typeof filter !== 'function') {
    throw new Error('MCP discovery import requires an explicit allowTools list or filter');
  }
  if (filter !== undefined && typeof filter !== 'function') throw new Error('filter must be a function');
  if (typeof capabilityPrefix !== 'string') throw new Error('capabilityPrefix must be a string');
  if (mapCapability !== undefined && typeof mapCapability !== 'function') throw new Error('mapCapability must be a function');

  const client = createMcpHttpClient({ endpoint, apiKey, authMode, requestTimeoutMs, fetchImpl });
  const providerAuthority = client.endpoint;
  const discovery = await client.discover();
  const uiExtensionDeclared = hasMcpUiExtensionCapability(discovery.capabilities);
  const resourcesDeclared = isObject(discovery.capabilities?.resources);
  const resourceClient = resourcesDeclared
    ? createMcpResourceHttpClient({
        endpoint: providerAuthority,
        apiKey,
        authMode,
        requestTimeoutMs,
        fetchImpl
      })
    : null;
  const catalog = await client.listAllTools({ maxPages, maxTools });
  const selected = [];
  const appOnlyTools = [];
  const appResources = [];
  const rejectedTools = [];
  const capabilityNames = new Set();

  for (const tool of catalog.tools) {
    const analysis = analyzeImportableTool(tool);
    if (!analysis.ok) {
      rejectedTools.push({ name: tool?.name || null, reason: analysis.reason });
      continue;
    }
    const appsAnalysis = analyzeAppsToolMetadata(tool, uiExtensionDeclared);
    if (!appsAnalysis.ok) {
      rejectedTools.push({ name: tool?.name || null, reason: appsAnalysis.reason });
      continue;
    }
    if (allowed.size > 0 && !allowed.has(tool.name)) continue;
    if (filter && !(await filter(tool))) continue;

    if (appsAnalysis.appsMetadata?.resourceUri) {
      appResources.push({
        tool: tool.name,
        providerAuthority,
        resourceUri: appsAnalysis.appsMetadata.resourceUri,
        visibility: [...appsAnalysis.appsMetadata.visibility]
      });
    }

    if (isAppOnlyTool(appsAnalysis.appsMetadata)) {
      appOnlyTools.push({ tool: tool.name, visibility: ['app'] });
      continue;
    }

    const capability = mapCapability
      ? await mapCapability(tool)
      : defaultCapabilityName(tool, capabilityPrefix);
    if (typeof capability !== 'string' || capability.trim().length === 0) {
      throw new Error(`MCP tool ${tool.name} mapped to an invalid TRUYN capability`);
    }
    if (capabilityNames.has(capability)) throw new Error(`MCP tools map to duplicate TRUYN capability: ${capability}`);
    capabilityNames.add(capability);
    selected.push({ tool, capability, appsMetadata: appsAnalysis.appsMetadata });
  }

  if (selected.length === 0) throw new Error('No model-callable MCP tools selected after allowlist/filter, schema, and visibility validation');
  selected.sort((a, b) => a.capability.localeCompare(b.capability));
  appOnlyTools.sort((a, b) => a.tool.localeCompare(b.tool));
  appResources.sort((a, b) => a.tool.localeCompare(b.tool) || a.resourceUri.localeCompare(b.resourceUri));
  const byCapability = new Map(selected.map((entry) => [entry.capability, entry]));
  const declaredAppResourceBindings = new Set(
    appResources.map((entry) => resourceBindingKey(entry.providerAuthority, entry.resourceUri))
  );
  const declaredToolResourceBindings = new Set(
    appResources.map((entry) => toolResourceBindingKey(entry.providerAuthority, entry.tool, entry.resourceUri))
  );
  const issuedToolResultBindings = new WeakMap();
  const serverInfo = isObject(discovery._meta?.[MCP_SERVER_INFO_META_KEY])
    ? discovery._meta[MCP_SERVER_INFO_META_KEY]
    : null;

  async function readBoundAppResource(reference) {
    if (!resourceClient) {
      throw new Error('MCP Apps UI resource resolution requires declared MCP resources capability');
    }
    const readResult = await resourceClient.readResource(reference.resourceUri);
    return validateMcpAppsResourceReadResult(reference.resourceUri, readResult);
  }

  return {
    name: 'mcp-discovery-import',
    version: '1',
    capabilities: selected.map(({ tool, capability }) => ({
      name: capability,
      description: tool.description || `Imported MCP tool ${tool.name}`,
      metadata: {
        interoperability: {
          protocol: 'mcp',
          protocolVersion: MCP_CURRENT_PROTOCOL_VERSION,
          remoteTool: tool.name,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema || null,
          serverInfo
        }
      }
    })),
    discovery: {
      protocolVersion: MCP_CURRENT_PROTOCOL_VERSION,
      providerAuthority,
      serverInfo,
      pages: catalog.pages,
      cacheHints: catalog.cacheHints,
      selectedTools: selected.map(({ tool, capability }) => ({ tool: tool.name, capability })),
      appOnlyTools,
      appResources,
      appResourceTrust: MCP_APPS_UI_TRUST_BOUNDARY,
      resourcesDeclared,
      rejectedTools
    },
    async resolveAppResource(resourceReference) {
      const reference = normalizeBoundResourceReference(resourceReference, providerAuthority);
      const binding = resourceBindingKey(reference.providerAuthority, reference.resourceUri);
      if (!declaredAppResourceBindings.has(binding)) {
        throw undeclaredResourceError(providerAuthority, reference.resourceUri);
      }
      return readBoundAppResource(reference);
    },
    async resolveToolResultAppResource(toolResult) {
      if (!isObject(toolResult)) {
        throw toolResultLinkError('MCP Apps UI resolution requires a tool result object issued by this provider');
      }
      const reference = issuedToolResultBindings.get(toolResult);
      if (!reference) {
        throw toolResultLinkError(
          'MCP Apps UI resolution requires an explicit resource linkage from a tool result issued by this provider'
        );
      }
      const binding = toolResourceBindingKey(reference.providerAuthority, reference.tool, reference.resourceUri);
      if (!declaredToolResourceBindings.has(binding)) {
        throw toolResultLinkError('MCP Apps tool result resource linkage no longer matches selected tool metadata', {
          providerAuthority: reference.providerAuthority,
          tool: reference.tool,
          resourceUri: reference.resourceUri
        });
      }
      return readBoundAppResource(reference);
    },
    async execute({ capability, input }) {
      const entry = byCapability.get(capability);
      if (!entry) throw new Error(`Unknown imported MCP capability: ${capability}`);
      if (!isObject(input)) throw new Error(`Imported MCP capability ${capability} requires object input`);
      const result = await client.callTool(entry.tool, input);
      const resourceUri = entry.appsMetadata?.resourceUri || null;
      if (!resourceUri) return result;

      const appResource = Object.freeze({
        providerAuthority,
        tool: entry.tool.name,
        resourceUri
      });
      const linkedResult = {
        ...result,
        metadata: {
          ...result.metadata,
          appResource
        }
      };
      issuedToolResultBindings.set(linkedResult, appResource);
      return linkedResult;
    }
  };
}
