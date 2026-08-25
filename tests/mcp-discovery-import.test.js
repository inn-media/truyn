import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { TruynAdapterHost } from '../adapters/sdk/index.js';
import { createMcpDiscoveryProvider } from '../adapters/providers/mcp-discovery.js';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function createRemoteMcp(t) {
  const requests = [];
  const toolCalls = [];
  const server = http.createServer(async (req, res) => {
    const body = await readJson(req);
    requests.push({ method: body.method, headers: req.headers, body });
    const reply = (result) => {
      const payload = JSON.stringify({ jsonrpc: '2.0', id: body.id, result });
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) });
      res.end(payload);
    };

    assert.equal(req.headers['mcp-protocol-version'], MCP_CURRENT_PROTOCOL_VERSION);
    assert.equal(req.headers['mcp-method'], body.method);
    assert.equal(body.params._meta['io.modelcontextprotocol/protocolVersion'], MCP_CURRENT_PROTOCOL_VERSION);
    assert.deepEqual(body.params._meta['io.modelcontextprotocol/clientCapabilities'], {});
    assert.equal(req.headers.authorization, 'Bearer secret-token');

    if (body.method === 'server/discover') {
      reply({
        resultType: 'complete',
        supportedVersions: [MCP_CURRENT_PROTOCOL_VERSION],
        capabilities: { tools: { listChanged: false } },
        instructions: 'test catalog',
        ttlMs: 1000,
        cacheScope: 'private',
        _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'remote-test', version: '1.0.0' } }
      });
      return;
    }

    if (body.method === 'tools/list') {
      if (!body.params.cursor) {
        reply({
          resultType: 'complete',
          tools: [
            {
              name: 'search',
              description: 'Search the private corpus',
              inputSchema: {
                type: 'object',
                properties: {
                  tenant: { type: 'string', 'x-mcp-header': 'Tenant' },
                  query: { type: 'string' }
                },
                required: ['tenant', 'query']
              },
              outputSchema: { type: 'object' }
            },
            {
              name: 'admin_delete',
              description: 'Must never be imported without allowlist selection',
              inputSchema: { type: 'object', properties: { id: { type: 'string' } } }
            },
            {
              name: 'broken_header',
              inputSchema: {
                type: 'object',
                properties: { score: { type: 'number', 'x-mcp-header': 'Score' } }
              }
            },
            {
              name: 'root_header',
              inputSchema: {
                type: 'object',
                'x-mcp-header': 'Tenant',
                properties: { tenant: { type: 'string' } }
              }
            }
          ],
          nextCursor: 'page-2',
          ttlMs: 500,
          cacheScope: 'private'
        });
      } else {
        assert.equal(body.params.cursor, 'page-2');
        reply({
          resultType: 'complete',
          tools: [
            {
              name: 'summarize',
              description: 'Filtered by the local import policy',
              inputSchema: { type: 'object', properties: { text: { type: 'string' } } }
            }
          ],
          ttlMs: 500,
          cacheScope: 'private'
        });
      }
      return;
    }

    if (body.method === 'tools/call') {
      assert.equal(req.headers['mcp-name'], 'search');
      toolCalls.push({ headers: req.headers, body });
      reply({
        resultType: 'complete',
        content: [{ type: 'text', text: 'ok' }],
        structuredContent: { answer: `found:${body.params.arguments.query}` }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  return { url: `http://127.0.0.1:${address.port}/mcp`, requests, toolCalls };
}

test('C2 MCP importer performs discover -> paginated tools/list -> explicit allowlist/filter', async (t) => {
  const remote = await createRemoteMcp(t);
  await assert.rejects(
    createMcpDiscoveryProvider({ endpoint: remote.url, authMode: 'none' }),
    /explicit allowTools list or filter/
  );

  const adapter = await createMcpDiscoveryProvider({
    endpoint: remote.url,
    apiKey: 'secret-token',
    authMode: 'bearer',
    allowTools: ['search', 'summarize', 'broken_header', 'root_header'],
    filter: (tool) => tool.name !== 'summarize'
  });

  assert.deepEqual(adapter.capabilities.map((item) => item.name), ['mcp.search']);
  assert.equal(adapter.capabilities[0].metadata.interoperability.remoteTool, 'search');
  assert.equal(adapter.discovery.pages, 2);
  assert.deepEqual(adapter.discovery.selectedTools, [{ tool: 'search', capability: 'mcp.search' }]);
  assert.deepEqual(adapter.discovery.rejectedTools, [
    {
      name: 'broken_header',
      reason: 'x-mcp-header at score requires string, integer, or boolean type'
    },
    {
      name: 'root_header',
      reason: 'x-mcp-header is not statically reachable through properties'
    }
  ]);
  assert.deepEqual(remote.requests.map((item) => item.method), ['server/discover', 'tools/list', 'tools/list']);
});

test('C2 imported MCP tool becomes an owner-authorized TRUYN OFFER and forwards x-mcp-header', async (t) => {
  const remote = await createRemoteMcp(t);
  const adapter = await createMcpDiscoveryProvider({
    endpoint: remote.url,
    apiKey: 'secret-token',
    authMode: 'bearer',
    allowTools: ['search']
  });

  const providerIdentity = createIdentity();
  const requesterIdentity = createIdentity();
  const attackerIdentity = createIdentity();
  const relay = createRelay({ localDevelopmentMode: false, allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const providerNode = new TruynNode({ relayUrl, identity: providerIdentity });
  const requester = new TruynNode({ relayUrl, identity: requesterIdentity });
  const attacker = new TruynNode({ relayUrl, identity: attackerIdentity });
  await requester.register();
  await attacker.register();

  const host = new TruynAdapterHost({
    node: providerNode,
    adapter,
    accessPolicy: createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: [requesterIdentity.nodeId] })
  });
  await host.publishCapabilities();

  const storedOffer = [...relay.state.offers.values()].find((offer) => offer.envelope.from === providerIdentity.nodeId);
  assert.ok(storedOffer, 'selected imported MCP tool must become a signed TRUYN OFFER');
  assert.equal(storedOffer.envelope.payload.capability.name, 'mcp.search');
  assert.equal(storedOffer.policy.ownerNodeId, providerIdentity.nodeId, 'TRUYN provider identity remains authoritative');
  assert.deepEqual(storedOffer.policy.allowedRequesterIds, [requesterIdentity.nodeId]);

  assert.equal((await requester.find('mcp.search')).offers.length, 1);
  assert.deepEqual((await requester.find('mcp.admin_delete')).offers, []);
  assert.deepEqual((await attacker.find('mcp.search')).offers, []);
  await assert.rejects(
    attacker.need('mcp.search', { tenant: 'attacker', query: 'steal' }),
    (error) => error.status === 404 && error.body?.error === 'no_matching_provider'
  );
  assert.equal(remote.toolCalls.length, 0, 'unauthorized requester must cause zero remote MCP execution');
  assert.equal((await providerNode.poll()).events.length, 0, 'unauthorized requester must create zero provider events');

  const input = { tenant: ' Алматы ', query: 'TRUYN' };
  const matched = await requester.need('mcp.search', input);
  assert.equal(matched.provider, providerIdentity.nodeId);
  const handled = await host.runOnce();
  assert.equal(handled.handled, 1);
  assert.equal(remote.toolCalls.length, 1);

  const call = remote.toolCalls[0];
  assert.deepEqual(call.body.params.arguments, input, 'TRUYN input maps directly to MCP tool arguments');
  assert.match(call.headers['mcp-param-tenant'], /^=\?base64\?.+\?=$/, 'unsafe/non-ASCII header value must use MCP Base64 sentinel');

  const resultEvents = (await requester.poll()).events;
  assert.equal(resultEvents.length, 1);
  assert.equal(resultEvents[0].kind, 'RESULT');
  assert.deepEqual(resultEvents[0].envelope.payload.output, { answer: 'found:TRUYN' });
});
