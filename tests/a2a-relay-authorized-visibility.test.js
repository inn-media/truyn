import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createA2aServer } from '../adapters/a2a/server.js';
import { A2A_PROTOCOL_VERSION } from '../adapters/a2a/mapping.js';

test('authenticated A2A visibility preserves relay-level trusted requester grants', { timeout: 10_000 }, async (t) => {
  const facadeIdentity = createIdentity();
  const relay = createRelay({
    allowPublicRegistration: true,
    trustedRequesterNodeIds: [facadeIdentity.nodeId]
  });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl });
  await provider.register({ name: 'relay-trusted-visibility-provider' });
  await provider.offer('relay.trusted.visibility', {
    accessMode: 'owner-only',
    allowedRequesterIds: ['different-provider-owner']
  });

  const facadeNode = new TruynNode({ relayUrl, identity: facadeIdentity });
  const facade = createA2aServer({
    node: facadeNode,
    agent: {
      name: 'Relay trusted visibility facade',
      description: 'Regression proof for authoritative relay-scoped A2A provider visibility.',
      version: '1.0.0-test'
    },
    skills: [{
      id: 'relay-trusted-skill',
      name: 'Relay trusted skill',
      description: 'Authenticated skill whose provider is authorized by the relay trust boundary.',
      capability: 'relay.trusted.visibility',
      visibility: 'authenticated',
      inputModes: ['application/json'],
      outputModes: ['application/json']
    }],
    authenticate: async () => ({ id: 'authenticated-transport-principal' }),
    authorize: async () => true
  });
  const facadeUrl = await facade.listen({ port: 0 });
  t.after(() => facade.close());

  const publicResponse = await fetch(`${facadeUrl}/.well-known/agent-card.json`);
  assert.equal(publicResponse.status, 200);
  const publicCard = await publicResponse.json();
  assert.deepEqual(publicCard.skills, [], 'owner-only provider must remain absent from the public Agent Card');

  const extendedResponse = await fetch(`${facadeUrl}/a2a`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'a2a-version': A2A_PROTOCOL_VERSION
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'relay-trusted-card',
      method: 'GetExtendedAgentCard',
      params: {}
    })
  });
  assert.equal(extendedResponse.status, 200);
  const extended = await extendedResponse.json();
  assert.equal(extended.error, undefined);
  assert.deepEqual(
    extended.result.skills.map((skill) => skill.id),
    ['relay-trusted-skill'],
    'authenticated visibility must preserve the relay-authorized offer returned for the actual facade node identity'
  );
});
