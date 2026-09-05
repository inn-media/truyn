import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const service = await readFile(new URL('../network/testnet/node-service.js', import.meta.url), 'utf8');
const campaign = await readFile(new URL('../benchmarks/scale/class-d-azure-1000-campaign.sh', import.meta.url), 'utf8');

test('DHT readiness exposes production peer-record propagation state', () => {
  assert.match(service, /const lifecycle = node\.peerRecordLifecycleSnapshot\(\);/);
  assert.match(service, /const propagationReady = node\.peerRecordPropagationReady\(\);/);
  assert.match(service, /ready: propagationReady,/);
  assert.match(service, /peerRecordPropagation: \{/);
  assert.match(service, /pendingCount: Array\.isArray\(propagation\.pendingNodeIds\)/);
});

test('readiness cannot report refreshed while mandatory peer-record propagation is pending', () => {
  assert.match(service, /refresh: refresh\.refreshed && !propagationReady/);
  assert.match(service, /status: 'peer_record_propagation_pending'/);
  assert.match(campaign, /if \[\[ "\\\$status" == refreshed && "\\\$valid" -ge \$\{BOOTSTRAP_MAX_PEERS_PER_NODE\}/);
});

test('repair does not add an application NEED retry path or weaken Class D gates', () => {
  assert.doesNotMatch(service, /retry.*node\.need|node\.need.*retry/is);
  assert.match(campaign, /assert float\('\$base_rate'\) >= \.99/);
  assert.match(campaign, /assert float\('\$conv_p95'\) <= 120000/);
});
