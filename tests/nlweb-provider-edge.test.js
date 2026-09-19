import assert from 'node:assert/strict';
import test from 'node:test';

import { createNlwebProviderEdge } from '../adapters/nlweb/provider-edge.js';

const fixtures = [
  { id: 'public-ok', name: 'Public search', description: 'Eligible public capability', visibility: 'public', nlweb: { enabled: true }, secret: 'never-project' },
  { id: 'public-disabled', visibility: 'public', nlweb: { enabled: false } },
  { id: 'private-enabled', visibility: 'private', nlweb: { enabled: true } },
  { id: 'public-denied', visibility: 'public', nlweb: { enabled: true } }
];

test('S72 exposes only explicitly eligible public NLWeb capabilities', async () => {
  const seenContexts = [];
  const edge = createNlwebProviderEdge({
    listCapabilities: async (context) => {
      seenContexts.push(context);
      return fixtures;
    },
    isPublicEligible: async (capability, context) => {
      assert.equal(context.actor, 'anonymous');
      return capability.id === 'public-ok';
    }
  });

  const result = await edge.listPublicCapabilities({ actor: 'anonymous' });
  assert.deepEqual(result, [{ id: 'public-ok', name: 'Public search', description: 'Eligible public capability' }]);
  assert.equal(result[0].secret, undefined);
  assert.equal(seenContexts.length, 1);
  assert.equal(edge.profile, '0.5');
  assert.match(edge.pinnedSource, /d973d4fe811830eb3734c01a79133adfc474c197$/);
});

test('S72 private or NLWeb-disabled capabilities never reach the authority predicate', async () => {
  const checked = [];
  const edge = createNlwebProviderEdge({
    listCapabilities: async () => fixtures,
    isPublicEligible: async (capability) => {
      checked.push(capability.id);
      return true;
    }
  });

  const result = await edge.listPublicCapabilities({ actor: 'anonymous' });
  assert.deepEqual(checked.sort(), ['public-denied', 'public-ok']);
  assert.deepEqual(result.map(({ id }) => id).sort(), ['public-denied', 'public-ok']);
  assert.equal(result.some(({ id }) => id === 'private-enabled'), false);
  assert.equal(result.some(({ id }) => id === 'public-disabled'), false);
});

test('S72 caller data cannot self-authorize capability exposure', async () => {
  const edge = createNlwebProviderEdge({
    listCapabilities: async () => fixtures,
    isPublicEligible: async () => false
  });

  const result = await edge.listPublicCapabilities({
    actor: 'anonymous',
    nlweb: { eligible: true },
    tenant: 'spoofed',
    provider: 'private-enabled'
  });
  assert.deepEqual(result, []);
});

test('S72 fails closed without canonical eligibility dependencies', () => {
  assert.throws(() => createNlwebProviderEdge({}), /listCapabilities must be a function/);
  assert.throws(() => createNlwebProviderEdge({ listCapabilities: async () => [] }), /isPublicEligible must be a function/);
});
