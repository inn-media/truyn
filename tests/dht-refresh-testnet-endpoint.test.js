import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../network/testnet/node-service.js', import.meta.url), 'utf8');

test('testnet node service exposes custom DHT refresh endpoint with before/after stats', () => {
  assert.match(source, /const refreshDht = async \(body = \{\}\) => \{/);
  assert.match(source, /const options = \{/);
  assert.match(source, /node\.discovery\.refreshRoutingTable\(options\)/);
  assert.match(source, /targetCount: int\(body\.targetCount, node\.discovery\.k, \{ min: 0, max: 256 \}\)/);
  assert.match(source, /maxRounds: int\(body\.maxRounds, 4, \{ min: 0, max: 64 \}\)/);
  assert.match(source, /targetConcurrency: int\(body\.targetConcurrency, 1, \{ min: 1, max: 16 \}\)/);
  assert.match(source, /timeoutMs: body\.timeoutMs == null \? null : int\(body\.timeoutMs, 240_000, \{ min: 1_000, max: 300_000 \}\)/);
  assert.match(source, /await node\.persistState\(\)/);
  assert.match(source, /if \(req\.method === 'POST' && url\.pathname === '\/dht\/refresh'\) return json\(res, 200, await refreshDht\(await readJson\(req\)\)\);/);
});

test('testnet DHT refresh stays on PeerDiscovery custom path', () => {
  assert.doesNotMatch(source, /refreshKademliaRoutingTable/);
  assert.doesNotMatch(source, /libp2p/i);
  assert.match(source, /if \(command === 'refresh'\) return refreshDht\(input\);/);
});
