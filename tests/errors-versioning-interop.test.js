import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { a2aError, a2aErrorData } from '../adapters/a2a/mapping.js';
import { createMcpHandler, createMcpHttpServer } from '../adapters/mcp/server.js';
import { createIdentity, signValue } from '../core/identity/index.js';
import { TruynNode } from '../node/client.js';
import { createSessionHello, createSessionAccept, verifySessionHello, verifySessionAccept } from '../network/sessions/authenticated-session.js';

test('signed peer negotiation refuses unshared generations and required semantics', () => {
  const initiator = createIdentity();
  const responder = createIdentity();
  const mismatch = createSessionHello({ identity: initiator, protocols: ['TRUYN/2'] });
  assert.deepEqual(
    { code: verifySessionHello(mismatch).code, reason: verifySessionHello(mismatch).reason },
    { code: 'version_mismatch', reason: 'no_protocol_overlap' }
  );
  const required = createSessionHello({
    identity: initiator,
    protocols: ['TRUYN/1'],
    semantics: ['critical-extension'],
    requiredSemantics: ['critical-extension']
  });
  const rejected = verifySessionHello(required);
  assert.equal(rejected.code, 'version_mismatch');
  assert.equal(rejected.reason, 'required_semantic_unavailable');
  assert.deepEqual(rejected.missingSemantics, ['critical-extension']);
  const accepted = createSessionAccept({ identity: responder, hello: required, transportBinding: 'test-binding', localSemantics: ['critical-extension'] });
  assert.equal(verifySessionAccept(accepted, required, { localSemantics: ['critical-extension'] }).ok, true);
  const tampered = { ...accepted, negotiatedProtocol: 'TRUYN/2' };
  assert.equal(verifySessionAccept(tampered, required, { localSemantics: ['critical-extension'] }).ok, false);
  const legacy = createSessionHello({ identity: initiator });
  const baseline = createSessionAccept({ identity: responder, hello: legacy, transportBinding: 'baseline' });
  assert.equal(verifySessionAccept(baseline, legacy).negotiated.protocol, 'TRUYN/1');
});

test('A2A preserves JSON-RPC reason and adds normalized TRUYN classification', () => {
  const v = a2aErrorData(a2aError(-32009, 'unsupported', 'VERSION_NOT_SUPPORTED'));
  assert.equal(v[0].reason, 'VERSION_NOT_SUPPORTED');
  assert.equal(v[0].metadata.truynCode, 'version_mismatch');
  const auth = a2aErrorData(a2aError(-32000, 'auth', 'AUTHENTICATION_REQUIRED'));
  assert.equal(auth[0].metadata.truynCode, 'unauthenticated');
  assert.equal(a2aErrorData(new Error('secret'))[0].metadata.truynCode, 'internal_error');
});

test('MCP keeps native JSON-RPC codes and attaches bounded TRUYN codes', async () => {
  const node = {
    identity: { nodeId: 'truyn:node:interop', algorithm: 'Ed25519' },
    sessionToken: null,
    async register() { this.sessionToken = 'mock-session'; },
    async need() { throw Object.assign(new Error('private provider details'), { status: 403 }); }
  };
  const handle = createMcpHandler({ node });
  const incompatible = await handle({
    jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2099-01-01' }
  });
  assert.equal(incompatible.error.code, -32022);
  assert.equal(incompatible.error.data.truynCode, 'version_mismatch');
  const denied = await handle({
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'truyn_need', arguments: { capability: 'reasoning', input: {} } }
  });
  assert.equal(denied.result.isError, true);
  assert.equal(denied.result._meta['truyn/errorCode'], 'permission_denied');
  assert.equal(JSON.stringify(denied).includes('private provider details'), false);
});

test('signed ACCEPT rejects malformed ads and forbids implicit legacy extensions', () => {
  const initiator = createIdentity();
  const responder = createIdentity();
  const hello = createSessionHello({ identity: initiator, protocols: ['TRUYN/1'], semantics: ['ext'] });
  const accept = createSessionAccept({ identity: responder, hello, transportBinding: 'fixture', localSemantics: ['ext'] });
  function resign(fields, removed = []) {
    const { publicKey, signature, ...body } = accept;
    for (const key of removed) delete body[key];
    const modified = { ...body, ...fields };
    return { ...modified, publicKey: responder.publicKeyPem, signature: signValue(modified, responder.privateKeyPem) };
  }
  for (const bad of [
    { supportedProtocols: ['TRUYN/1', 7] },
    { supportedSemantics: null },
    { negotiatedSemantics: 'ext' },
    { negotiatedProtocol: null }
  ]) {
    const result = verifySessionAccept(resign(bad), hello, { localSemantics: ['ext'] });
    assert.equal(result.code, 'version_mismatch');
    assert.equal(result.reason, 'invalid_advertisement');
  }
  const legacy = resign({}, ['negotiatedProtocol', 'negotiatedSemantics', 'supportedSemantics', 'supportedProtocols']);
  const result = verifySessionAccept(legacy, hello, { localSemantics: ['ext'] });
  assert.equal(result.ok, true, 'legacy ACCEPT must retain baseline compatibility');
  assert.deepEqual(result.negotiated.semantics, [], 'legacy ACCEPT must never enable an extension');
  const partial = resign({}, ['negotiatedProtocol', 'negotiatedSemantics']);
  assert.equal(verifySessionAccept(partial, hello, { localSemantics: ['ext'] }).reason, 'missing_negotiation');
});

test('MCP HTTP preserves numeric JSON-RPC codes but classifies origin and payload exhaustion correctly', async () => {
  const server = createMcpHttpServer({ node: { identity: { nodeId: 'truyn:node:interop-http' } }, maxBodyBytes: 80 });
  const endpoint = await server.listen({ port: 0 });
  try {
    const badOrigin = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://outside.invalid' }, body: '{}' });
    assert.equal(badOrigin.status, 403);
    const forbidden = await badOrigin.json();
    assert.equal(forbidden.error.code, -32000);
    assert.equal(forbidden.error.data.truynCode, 'permission_denied');
    const large = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(200) }) });
    assert.equal(large.status, 413);
    assert.equal((await large.json()).error.data.truynCode, 'resource_exhausted');
  } finally { await server.close(); }
});

test('inbound signed peer HELLO must satisfy responder-required extensions before acceptance', () => {
  const caller = createIdentity();
  const hello = createSessionHello({ identity: caller, protocols: ['TRUYN/1'], semantics: [] });
  const result = verifySessionHello(hello, {
    localSemantics: ['critical-extension'], localRequiredSemantics: ['critical-extension']
  });
  assert.equal(result.code, 'version_mismatch');
  assert.equal(result.reason, 'required_semantic_unavailable');
  assert.deepEqual(result.missingSemantics, ['critical-extension']);
});

test('A2A normalizes authoritative relay exhaustion without leaking raw details', () => {
  const error = Object.assign(new Error('private backend secret'), {
    status: 429, code: 'cancellation_backpressure'
  });
  const result = a2aErrorData(error);
  assert.equal(result[0].metadata.truynCode, 'resource_exhausted');
  assert.equal(JSON.stringify(result).includes('private backend secret'), false);
});

test('client rejects malformed or unconfirmed relay selection without accepting a session', async () => {
  const cases = [
    { negotiatedProtocol: null, negotiatedSemantics: ['critical-extension'], reason: 'invalid_advertisement' },
    { negotiatedSemantics: ['critical-extension'], reason: 'missing_negotiation' }
  ];
  let call = 0;
  const server = http.createServer((req, res) => {
    const selected = cases[call++] || cases[cases.length - 1];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, sessionToken: 'not-accepted', negotiatedSemantics: selected.negotiatedSemantics,
      ...(Object.hasOwn(selected, 'negotiatedProtocol') ? { negotiatedProtocol: selected.negotiatedProtocol } : {}) }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    for (const entry of cases) {
      const node = new TruynNode({ relayUrl: `http://127.0.0.1:${address.port}`, identity: createIdentity() });
      await assert.rejects(node.register({ semantics: ['critical-extension'] }),
        (error) => error.code === 'version_mismatch' && error.reason === entry.reason);
      assert.equal(node.sessionToken, null);
    }
    assert.equal(call, cases.length);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
