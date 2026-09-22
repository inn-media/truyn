import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity, verifyValue } from '../core/identity/index.js';
import { createPublicAgentDescriptorRefresher } from '../runtime/agent-descriptor.js';

function verifyDescriptor(descriptor, identity) {
  const { signature, ...unsigned } = descriptor;
  assert.equal(descriptor.identity, identity.nodeId);
  assert.equal(verifyValue(unsigned, signature, identity.publicKeyPem), true);
  const ttlMs = new Date(descriptor.expiresAt).getTime() - new Date(descriptor.issuedAt).getTime();
  assert.equal(ttlMs, 60_000);
}

test('public Agent Descriptor refreshes and re-signs before bounded TTL expiry', () => {
  const identity = createIdentity();
  const env = {
    TRUYN_PUBLIC_AGENT_DESCRIPTOR: '1',
    TRUYN_PUBLIC_AGENT_DESCRIPTOR_URL: 'https://agent.example/.well-known/truyn-agent.json',
    TRUYN_PUBLIC_CAPABILITIES: 'reasoning.general',
    TRUYN_AGENT_DESCRIPTOR_TTL_MS: '60000'
  };
  let now = new Date('2026-09-22T00:00:00.000Z');
  const refresher = createPublicAgentDescriptorRefresher({
    identity,
    capabilities: ['reasoning.general', 'private.hidden'],
    env,
    now: () => now
  });

  const first = refresher.get();
  verifyDescriptor(first, identity);
  assert.deepEqual(first.capabilities, [{ id: 'reasoning.general' }]);

  now = new Date('2026-09-22T00:00:30.000Z');
  assert.equal(refresher.get(), first, 'descriptor remains stable outside the refresh window');

  now = new Date('2026-09-22T00:00:45.000Z');
  const refreshed = refresher.get();
  assert.notEqual(refreshed, first, 'descriptor is replaced inside the refresh window');
  assert.notEqual(refreshed.issuedAt, first.issuedAt);
  assert.notEqual(refreshed.expiresAt, first.expiresAt);
  verifyDescriptor(refreshed, identity);
  assert.deepEqual(refreshed.capabilities, [{ id: 'reasoning.general' }]);
});

test('descriptor refresher remains disabled when public descriptor serving is disabled', () => {
  const identity = createIdentity();
  assert.equal(createPublicAgentDescriptorRefresher({ identity, env: {} }), null);
});
