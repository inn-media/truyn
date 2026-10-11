import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createEnvelope } from '../core/protocol/index.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

function registrationEnvelope(identity, createdAt = new Date().toISOString()) {
  return createEnvelope({
    type: 'IDENTITY',
    from: identity.nodeId,
    createdAt,
    privateKeyPem: identity.privateKeyPem,
    publicKeyPem: identity.publicKeyPem,
    payload: {
      nodeId: identity.nodeId,
      algorithm: identity.algorithm,
      protocols: ['TRUYN/1'],
      name: null
    }
  });
}

async function register(relayUrl, envelope) {
  const response = await fetch(`${relayUrl}/v1/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ envelope })
  });
  return { status: response.status, body: await response.json() };
}

test('TRUYN/1 registration rejects stale and future signed timestamps', async (t) => {
  const identity = createIdentity();
  const relay = createRelay({ localDevelopmentMode: false, allowedNodeIds: [identity.nodeId] });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const stale = registrationEnvelope(identity, new Date(Date.now() - 5 * 60 * 1000 - 1_000).toISOString());
  const staleResult = await register(relayUrl, stale);
  assert.equal(staleResult.status, 400);
  assert.equal(staleResult.body.error, 'stale_registration');

  const future = registrationEnvelope(identity, new Date(Date.now() + 30_000 + 5_000).toISOString());
  const futureResult = await register(relayUrl, future);
  assert.equal(futureResult.status, 400);
  assert.equal(futureResult.body.error, 'stale_registration');
});

test('TRUYN/1 registration message ID is replay-protected', async (t) => {
  const identity = createIdentity();
  const relay = createRelay({ localDevelopmentMode: false, allowedNodeIds: [identity.nodeId] });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const envelope = registrationEnvelope(identity);
  const first = await register(relayUrl, envelope);
  assert.equal(first.status, 200);

  const replay = await register(relayUrl, envelope);
  assert.equal(replay.status, 409);
  assert.equal(replay.body.error, 'registration_replay');
});

test('TRUYN relay registration refuses incompatible generations and mandatory extensions before minting a session', async (t) => {
  const identity = createIdentity();
  const relay = createRelay({ localDevelopmentMode: false, allowedNodeIds: [identity.nodeId] });
  const url = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  function signedRegistration(protocols, requiredSemantics = []) {
    return createEnvelope({
      type: 'IDENTITY', from: identity.nodeId,
      privateKeyPem: identity.privateKeyPem, publicKeyPem: identity.publicKeyPem,
      payload: { nodeId: identity.nodeId, algorithm: identity.algorithm, protocols, requiredSemantics, name: null }
    });
  }
  const incompatible = await register(url, signedRegistration(['TRUYN/2']));
  assert.equal(incompatible.status, 409);
  assert.equal(incompatible.body.error, 'version_mismatch');
  assert.equal(incompatible.body.reason, 'no_protocol_overlap');
  assert.equal(relay.state.sessions.size, 0);

  const missing = await register(url, signedRegistration(['TRUYN/1'], ['critical-extension']));
  assert.equal(missing.status, 409);
  assert.equal(missing.body.error, 'version_mismatch');
  assert.equal(missing.body.reason, 'required_semantic_unavailable');
  assert.deepEqual(missing.body.missingSemantics, ['critical-extension']);
  assert.equal(relay.state.nodes.size, 0);
  assert.equal(relay.state.sessions.size, 0);

  for (const malformed of [
    { protocols: null },
    { protocols: ['TRUYN/1'], semantics: null },
    { protocols: ['TRUYN/1'], requiredSemantics: null }
  ]) {
    const envelope = createEnvelope({
      type: 'IDENTITY', from: identity.nodeId,
      privateKeyPem: identity.privateKeyPem, publicKeyPem: identity.publicKeyPem,
      payload: { nodeId: identity.nodeId, algorithm: identity.algorithm, ...malformed }
    });
    const result = await register(url, envelope);
    assert.equal(result.body.error, 'version_mismatch');
    assert.equal(result.body.reason, 'invalid_advertisement');
    assert.equal(relay.state.sessions.size, 0);
  }
  const client = new TruynNode({ relayUrl: url, identity });
  await assert.rejects(client.register({ protocols: ['TRUYN/2'] }),
    (error) => error.code === 'version_mismatch' && error.reason === 'no_protocol_overlap');
  assert.equal(relay.state.sessions.size, 0);

  const baseline = await register(url, signedRegistration(['TRUYN/1', 'A2A/1.0']));
  assert.equal(baseline.status, 200);
  assert.equal(baseline.body.negotiatedProtocol, 'TRUYN/1');
  assert.deepEqual(baseline.body.negotiatedSemantics, []);
  assert.equal(relay.state.sessions.size, 1);
});
