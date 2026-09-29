import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBootstrapServices } from '../core/network/bootstrap-dns.js';

test('S142 resolves deterministic bootstrap service set from configured DNS metadata', async () => {
  const queries = [];
  const resolver = {
    async resolveSrv(name) {
      queries.push(name);
      return [
        { name: 'b.truyn.example.', port: 443, priority: 20, weight: 1 },
        { name: 'a.truyn.example.', port: 443, priority: 10, weight: 5 }
      ];
    }
  };
  const result = await resolveBootstrapServices({ network: 'mainnet', discoveryDomain: 'bootstrap.truyn.org', resolver });
  assert.deepEqual(queries, ['_truyn-bootstrap._tcp.mainnet.bootstrap.truyn.org']);
  assert.deepEqual(result.entries.map(({ target, port }) => ({ target, port })), [
    { target: 'a.truyn.example', port: 443 },
    { target: 'b.truyn.example', port: 443 }
  ]);
});

test('S142 requires service discovery metadata and never accepts a user seed IP', async () => {
  const resolver = { async resolveSrv() { return [{ name: '203.0.113.10', port: 443, priority: 0, weight: 0 }]; } };
  await assert.rejects(
    resolveBootstrapServices({ network: 'mainnet', discoveryDomain: '203.0.113.9', resolver }),
    /DNS name/
  );
});

test('S142 fails closed for empty, malformed, or unsupported discovery', async () => {
  await assert.rejects(resolveBootstrapServices({ network: 'local', discoveryDomain: 'bootstrap.truyn.org', resolver: { resolveSrv: async () => [] } }), /testnet or mainnet/);
  await assert.rejects(resolveBootstrapServices({ network: 'mainnet', discoveryDomain: 'bootstrap.truyn.org', resolver: { resolveSrv: async () => [] } }), /1..32/);
  await assert.rejects(resolveBootstrapServices({ network: 'mainnet', discoveryDomain: 'bootstrap.truyn.org', resolver: { resolveSrv: async () => [{ name: 'seed.example', port: 70000 }] } }), /port is invalid/);
});
