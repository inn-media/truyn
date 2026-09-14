import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createEnvelope } from '../core/protocol/index.js';
import { createRelay } from '../network/relay/server.js';

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
