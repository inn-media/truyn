import { createMcpHttpClient, analyzeMcpToolDefinition, MCP_CURRENT_PROTOCOL_VERSION, MCP_SERVER_INFO_META_KEY } from '../mcp/client.js';

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
  fetchImpl = fetch
} = {}) {
  const allowed = normalizeAllowTools(allowTools);
  if (allowed.size === 0 && typeof filter !== 'function') {
    throw new Error('MCP discovery import requires an explicit allowTools list or filter');
  }
  if (filter !== undefined && typeof filter !== 'function') throw new Error('filter must be a function');
  if (typeof capabilityPrefix !== 'string') throw new Error('capabilityPrefix must be a string');
  if (mapCapability !== undefined && typeof mapCapability !== 'function') throw new Error('mapCapability must be a function');

  const client = createMcpHttpClient({ endpoint, apiKey, authMode, fetchImpl });
  const discovery = await client.discover();
  const catalog = await client.listAllTools({ maxPages, maxTools });
  const selected = [];
  const rejectedTools = [];
  const capabilityNames = new Set();

  for (const tool of catalog.tools) {
    const analysis = analyzeImportableTool(tool);
    if (!analysis.ok) {
      rejectedTools.push({ name: tool?.name || null, reason: analysis.reason });
      continue;
    }
    if (allowed.size > 0 && !allowed.has(tool.name)) continue;
    if (filter && !(await filter(tool))) continue;
    const capability = mapCapability
      ? await mapCapability(tool)
      : defaultCapabilityName(tool, capabilityPrefix);
    if (typeof capability !== 'string' || capability.trim().length === 0) {
      throw new Error(`MCP tool ${tool.name} mapped to an invalid TRUYN capability`);
    }
    if (capabilityNames.has(capability)) throw new Error(`MCP tools map to duplicate TRUYN capability: ${capability}`);
    capabilityNames.add(capability);
    selected.push({ tool, capability });
  }

  if (selected.length === 0) throw new Error('No MCP tools selected after allowlist/filter and schema validation');
  selected.sort((a, b) => a.capability.localeCompare(b.capability));
  const byCapability = new Map(selected.map((entry) => [entry.capability, entry.tool]));
  const serverInfo = isObject(discovery._meta?.[MCP_SERVER_INFO_META_KEY])
    ? discovery._meta[MCP_SERVER_INFO_META_KEY]
    : null;

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
      serverInfo,
      pages: catalog.pages,
      cacheHints: catalog.cacheHints,
      selectedTools: selected.map(({ tool, capability }) => ({ tool: tool.name, capability })),
      rejectedTools
    },
    async execute({ capability, input }) {
      const tool = byCapability.get(capability);
      if (!tool) throw new Error(`Unknown imported MCP capability: ${capability}`);
      if (!isObject(input)) throw new Error(`Imported MCP capability ${capability} requires object input`);
      return client.callTool(tool, input);
    }
  };
}
