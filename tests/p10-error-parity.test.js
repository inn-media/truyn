import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyTruynError, classifyTruynException, TRUYN_ERROR_CODES } from '../core/protocol/normalized-errors.js';
import { a2aError, a2aErrorData } from '../adapters/a2a/mapping.js';
import { createMcpHandler } from '../adapters/mcp/server.js';
import { createHttpAdapterServer } from '../adapters/http/server.js';
import { normalizeNlwebCompatibilityError } from '../adapters/nlweb/response.js';

const samples = [
  { status: 401, sourceCode: 'unauthorized', code: 'unauthenticated' },
  { status: 403, sourceCode: 'provider_access_denied', code: 'permission_denied' },
  { status: 400, sourceCode: 'invalid_request', code: 'invalid_argument' },
  { status: 404, sourceCode: 'no_matching_provider', code: 'not_found' },
  { status: 409, sourceCode: 'duplicate_request', code: 'conflict' },
  { status: 503, sourceCode: 'offer_capacity_reached', code: 'resource_exhausted' },
  { status: 429, sourceCode: 'cancellation_backpressure', code: 'resource_exhausted' },
  { status: 504, sourceCode: 'result_wait_timeout', code: 'deadline_exceeded' },
  { status: 409, sourceCode: 'version_mismatch', code: 'version_mismatch' },
  { status: 501, sourceCode: 'not_a_public_code', code: 'unimplemented' },
  { status: 500, sourceCode: 'unknown_private_error', code: 'internal_error' }
];

test('P10 registry matches every stable public class and no legacy alias leaks', () => {
  const spec = readFileSync(new URL('../spec/protocol/v1/errors.md', import.meta.url), 'utf8');
  assert.equal(TRUYN_ERROR_CODES.length, 13);
  for (const code of TRUYN_ERROR_CODES) assert.ok(spec.includes('`' + code + '`'), code);
  for (const alias of ['unauthorized', 'invalid_request', 'authorization_denied', 'payload_too_large']) {
    assert.ok(!TRUYN_ERROR_CODES.includes(alias));
  }
});

test('P10 HTTP, MCP and A2A preserve identical normalized classifications and bounded messages', async () => {
  for (const entry of samples) {
    const classified = classifyTruynError(entry);
    assert.equal(classified.code, entry.code, JSON.stringify(entry));
    const reason = entry.sourceCode;
    const error = Object.assign(new Error('provider-secret-DO-NOT-LEAK'), { status: entry.status, code: reason });
    assert.equal(classifyTruynException(error).code, entry.code);
    assert.equal(a2aErrorData(error)[0].metadata.truynCode, entry.code);
    const node = {
      identity: { nodeId: 'truyn:node:p10-fixture', algorithm: 'Ed25519' },
      sessionToken: 'active',
      async register() { this.sessionToken = 'active'; },
      async find() { throw error; }
    };
    const mcp = createMcpHandler({ node });
    const result = await mcp({ jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'truyn_find', arguments: { capability: 'research' } } });
    assert.equal(result.result.isError, true);
    assert.equal(result.result._meta['truyn/errorCode'], entry.code, reason);
    assert.ok(!JSON.stringify(result).includes('provider-secret-DO-NOT-LEAK'));
    const adapter = createHttpAdapterServer({ node });
    const endpoint = await adapter.listen({ port: 0 });
    try {
      const res = await fetch(endpoint + '/v1/discovery');
      const body = await res.json();
      assert.equal(body.error.code, entry.code, reason);
      assert.ok(!JSON.stringify(body).includes('provider-secret-DO-NOT-LEAK'));
    } finally { await adapter.close(); }
  }
});

test('P10 preserves native RPC reasons and NLWeb source profile errors', () => {
  const native = a2aErrorData(a2aError(-32009, 'unsupported', 'VERSION_NOT_SUPPORTED'))[0];
  assert.equal(native.reason, 'VERSION_NOT_SUPPORTED');
  assert.equal(native.metadata.truynCode, 'version_mismatch');
  for (const code of ['UNSUPPORTED_PROFILE', 'UNSUPPORTED_VERSION', 'UNSUPPORTED_SEMANTICS']) {
    const error = normalizeNlwebCompatibilityError({ code });
    assert.match(error.code, /^NLWEB_/);
    assert.equal(error.truynCode, 'version_mismatch');
  }
});

test('P10 WebSocket error frames retain native source while exposing the same normalized class', async () => {
  const { createRelay } = await import('../network/relay/server.js');
  const { TruynNode } = await import('../node/client.js');
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  const node = new TruynNode({ relayUrl });
  try {
    await node.register({ name: 'p10-ws-negative' });
    await node.ensureFastSocket();
    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('P10 WS error response timed out')), 4000);
      node.fastSocket.once('message', (data) => {
        clearTimeout(timer);
        try { resolve(JSON.parse(data.toString())); } catch (error) { reject(error); }
      });
    });
    node.fastSocket.send(JSON.stringify({ kind: 'UNSUPPORTED' }));
    const result = await received;
    assert.equal(result.kind, 'ERROR');
    assert.equal(result.status, 400);
    assert.equal(result.error, 'unsupported_socket_message');
    assert.equal(result.truynCode, 'invalid_argument');
  } finally {
    node.closeFastSocket();
    await relay.close();
  }
});
