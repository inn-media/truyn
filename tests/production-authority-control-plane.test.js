import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { configureRelayProviderGrantAuthority } from '../core/security/relay-provider-policy.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

function injectedGrantAuthority({ providerNodeId, allowedRequesterId, capability }) {
  let active = true;
  let revision = 1;
  return {
    durable: true,
    authorize({ providerNodeId: candidateProvider, requesterNodeId, capability: candidateCapability }) {
      if (!active) return { ok: false, reason: 'shared_grant_required' };
      const ok = candidateProvider === providerNodeId && requesterNodeId === allowedRequesterId && candidateCapability === capability;
      return ok ? { ok: true, mode: 'shared', grantId: 'grant-1' } : { ok: false, reason: 'shared_grant_required' };
    },
    visibleToRequester(input) { return this.authorize(input); },
    getProviderPolicy(candidateProvider) {
      return candidateProvider === providerNodeId ? { providerNodeId, mode: 'shared', status: 'active' } : null;
    },
    revoke() { active = false; revision += 1; },
    get revision() { return revision; }
  };
}

test('real relay ignores provider-signed access widening and follows injected durable grant revocation immediately', { concurrency: false }, async (t) => {
  const providerIdentity = createIdentity();
  const authorizedIdentity = createIdentity();
  const attackerIdentity = createIdentity();
  const authority = injectedGrantAuthority({
    providerNodeId: providerIdentity.nodeId,
    allowedRequesterId: authorizedIdentity.nodeId,
    capability: 'secure.cap'
  });
  const previous = configureRelayProviderGrantAuthority(authority);
  t.after(() => configureRelayProviderGrantAuthority(previous));

  const relay = createRelay({ allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const provider = new TruynNode({ relayUrl, identity: providerIdentity });
  const authorized = new TruynNode({ relayUrl, identity: authorizedIdentity });
  const attacker = new TruynNode({ relayUrl, identity: attackerIdentity });
  await provider.register();
  await authorized.register();
  await attacker.register();

  await provider.offer('secure.cap', {
    accessMode: 'public',
    allowedRequesterIds: [attackerIdentity.nodeId],
    tenantId: 'tenant-forged',
    ownerId: attackerIdentity.nodeId
  });

  assert.equal((await authorized.find('secure.cap')).offers.length, 1);
  assert.equal((await attacker.find('secure.cap')).offers.length, 0, 'provider-signed public/allowlist metadata must not widen server-side policy');
  assert.equal((await authorized.need('secure.cap', { prompt: 'allowed by injected grant' })).provider, providerIdentity.nodeId);

  authority.revoke();
  assert.equal((await authorized.find('secure.cap')).offers.length, 0);
  await assert.rejects(
    authorized.need('secure.cap', { prompt: 'revoked' }),
    (error) => error.status === 404 && error.body?.error === 'no_matching_provider'
  );
});
