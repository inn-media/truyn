import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../network/testnet/node-service.js', import.meta.url), 'utf8');
const readinessRoute = "if (req.method === 'GET' && url.pathname === '/dht/readiness') return json(res, 200, dhtReadiness());";

test('testnet node service exposes read-only DHT readiness endpoint', () => {
  assert.match(source, /const dhtReadiness = \(\) => \{/);
  assert.match(source, /node\.discovery\.routingSnapshot\(\)/);
  assert.match(source, /node\.discovery\.leaseSnapshot\(\)/);
  assert.match(source, /node\.discovery\.periodicRefreshSnapshot\(\)/);
  assert.match(source, /remoteEndpointDiversity: remoteEndpointDiversity\(\)/);
  assert.match(source, /refresh: lastDhtRefresh \|\| \{/);
  assert.match(source, /status: 'never_refreshed'/);
  assert.ok(source.includes(readinessRoute));
  assert.ok(!readinessRoute.includes('refreshDht'));
});

test('DHT readiness reports peer, bucket, lease and endpoint diversity fields', () => {
  assert.match(source, /peerRecordSequence: localPeerRecord\.sequence \|\| 0/);
  assert.match(source, /localPeerRecordLease: \{/);
  assert.match(source, /peerRecordLeases,/);
  assert.match(source, /periodicRefresh,/);
  assert.match(source, /validPeers: routing\.validPeers/);
  assert.match(source, /populatedBuckets: routing\.populatedBuckets/);
  assert.match(source, /bucketOccupancy: Array\.isArray\(snapshot\.bucketOccupancy\)/);
  assert.match(source, /remotePeerRecords: records\.length/);
  assert.match(source, /endpointCount: endpoints\.size/);
  assert.match(source, /hostCount: hosts\.size/);
  assert.match(source, /portCount: ports\.size/);
  assert.match(source, /nearExpiryTargets: result\.targetSelection\?\.nearExpiryTargets \|\| 0/);
  assert.match(source, /xorTargets: result\.targetSelection\?\.xorTargets \|\| 0/);
});

test('DHT readiness is separate from refresh and stays on custom path', () => {
  assert.match(source, /if \(command === 'readiness'\) return dhtReadiness\(\);/);
  assert.match(source, /lastDhtRefresh = \{/);
  assert.ok(source.indexOf(readinessRoute) < source.indexOf("if (req.method === 'POST' && url.pathname === '/dht/refresh'"));
  assert.doesNotMatch(source, /refreshKademliaRoutingTable/);
  assert.doesNotMatch(source, /libp2p/i);
});