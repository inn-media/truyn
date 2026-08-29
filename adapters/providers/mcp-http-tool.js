import { encodeMcpHeaderValue } from '../mcp/http-headers.js';

export const MCP_PROVIDER_PROTOCOL_VERSION = '2026-07-28';
const MCP_PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion';
const MCP_CLIENT_INFO_META_KEY = 'io.modelcontextprotocol/clientInfo';
const MCP_CLIENT_CAPABILITIES_META_KEY = 'io.modelcontextprotocol/clientCapabilities';
const MAX_SSE_RESPONSE_BYTES = 1024 * 1024;

function normalizeEndpoint(endpoint) {
  let parsed;
  try { parsed = new URL(endpoint); } catch { throw new Error('MCP_HTTP_ENDPOINT must be an absolute URL'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('MCP_HTTP_ENDPOINT must use http or https');
  return parsed.toString();
}
function outputFromResult(result) {
  if (!result || typeof result !== 'object') return result;
  if (Object.prototype.hasOwnProperty.call(result, 'structuredContent')) return result.structuredContent;
  if (Array.isArray(result.content)) {
    const text = result.content.filter((item) => item?.type === 'text' && typeof item.text === 'string').map((item) => item.text);
    if (text.length === result.content.length) return text.join('\n');
    return result.content;
  }
  return result;
}
function errorText(result) {
  if (!Array.isArray(result?.content)) return 'MCP tool returned an error';
  const text = result.content.filter((item) => item?.type === 'text' && typeof item.text === 'string').map((item) => item.text).join('\n').trim();
  return text || 'MCP tool returned an error';
}
function parseSseJsonRpc(text, expectedId) {
  if (Buffer.byteLength(text, 'utf8') > MAX_SSE_RESPONSE_BYTES) throw new Error('MCP SSE response exceeds size limit');
  const events = text.split(/\r?\n\r?\n/);
  for (const event of events) {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data) continue;
    let message;
    try { message = JSON.parse(data); } catch { continue; }
    if (message?.id === expectedId) return message;
  }
  throw new Error('MCP SSE response did not contain the matching JSON-RPC result');
}
async function readProviderResponse(response, expectedId) {
  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  let body;
  if (contentType.includes('application/json')) body = await response.json();
  else if (contentType.includes('text/event-stream')) {
    if (typeof response.text !== 'function') throw new Error('MCP SSE response body is unavailable');
    body = parseSseJsonRpc(await response.text(), expectedId);
  } else throw new Error(`MCP HTTP provider requires application/json or text/event-stream response, received ${contentType || 'unknown content type'}`);
  if (body?.id !== undefined && body.id !== expectedId) throw new Error('MCP JSON-RPC response id mismatch');
  return body;
}
function assertModernToolResult(body, expectedId) {
  if (!body || body.jsonrpc !== '2.0' || body.id !== expectedId || !body.result || typeof body.result !== 'object') throw new Error('MCP modern tool response is not a matching JSON-RPC result');
  if (body.result.resultType !== 'complete') {
    if (body.result.resultType === 'input_required') throw new Error('MCP input_required is not supported by the configured single-tool provider path');
    throw new Error('MCP modern tool response requires resultType=complete');
  }
  if (!Array.isArray(body.result.content)) throw new Error('MCP modern tool response requires content array');
}

export function createMcpHttpToolProvider({ endpoint = process.env.MCP_HTTP_ENDPOINT, tool = process.env.MCP_HTTP_TOOL, apiKey = process.env.MCP_HTTP_API_KEY, authMode = apiKey ? 'bearer' : 'none', capabilities = ['reasoning.general'], fetchImpl = fetch } = {}) {
  if (!endpoint) throw new Error('MCP_HTTP_ENDPOINT is required');
  if (!tool || typeof tool !== 'string') throw new Error('MCP_HTTP_TOOL is required');
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  if (!['none', 'bearer'].includes(authMode)) throw new Error(`Unsupported MCP HTTP auth mode: ${authMode}`);
  if (authMode === 'bearer' && !apiKey) throw new Error('MCP_HTTP_API_KEY is required for bearer auth');
  return {
    name: 'mcp-http-tool', version: '1', capabilities,
    async execute({ capability, input, policy, signal }) {
      const startedAt = Date.now();
      const id = `truyn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': MCP_PROVIDER_PROTOCOL_VERSION, 'mcp-method': 'tools/call', 'mcp-name': encodeMcpHeaderValue(tool) };
      if (authMode === 'bearer') headers.authorization = `Bearer ${apiKey}`;
      const response = await fetchImpl(normalizedEndpoint, {
        method: 'POST', headers, signal,
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: tool, arguments: { capability, input, policy: policy || {} }, _meta: { [MCP_PROTOCOL_VERSION_META_KEY]: MCP_PROVIDER_PROTOCOL_VERSION, [MCP_CLIENT_INFO_META_KEY]: { name: 'truyn-byok-provider', version: '0.1.0' }, [MCP_CLIENT_CAPABILITIES_META_KEY]: {} } } })
      });
      const body = await readProviderResponse(response, id);
      if (!response.ok) throw new Error(body?.error?.message || `MCP HTTP ${response.status}`);
      if (body?.error) throw new Error(body.error.message || 'MCP JSON-RPC error');
      assertModernToolResult(body, id);
      if (body.result.isError) throw new Error(errorText(body.result).slice(0, 500));
      return { output: outputFromResult(body.result), metadata: { provider: 'mcp-http', tool, providerRequestId: body.id, providerLatencyMs: Date.now() - startedAt, usage: body.result._meta?.usage || null } };
    }
  };
}
