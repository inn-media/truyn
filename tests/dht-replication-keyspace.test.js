import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdentity } from '../core/identity/index.js';
import { dhtId, KademliaRecordStore, createDhtRecord } from '../network/dht/kademlia.js';
import { createQuicDiscoveryControlHandler, QUIC_DHT_METHOD_STORE } from '../network/discovery/quic-rpc.js';
import { DhtReplicationManager } from '../network/replication/dht-replication.js';

test('DHT replication performs bounded canonical keyspace discovery before placement', async () => {
  const publisher = createIdentity();
  const holder = createIdentity();
  const record = createDhtRecord({
    identity: publisher,
    namespace: 'durability',
    key: 'acknowledged-write',
    value: { durable: true },
    ttlMs: 120_000
  });
  let expanded = false;
  let walkedTarget = null;
  const discovery = {
    identity: publisher,
    closest(target) {
      assert.equal(dhtId(target), record.keyHash, 'placement target must match the signed DHT key hash');
      return expanded ? [{ nodeId: holder.nodeId }] : [];
    },
    async walk(target, options) {
      walkedTarget = target;
      assert.deepEqual(options, { maxRounds: 4, stopOnFound: false });
      expanded = true;
      return { queried: ['bootstrap-peer'], rounds: 1, responses: 1 };
    }
  };
  const storedRemotely = [];
  const rpc = {
    async store(peer, value) {
      storedRemotely.push({ peer: peer.nodeId, recordId: value.recordId });
      return { stored: true };
    },
    forget() {}
  };
  const manager = new DhtReplicationManager({
    discovery,
    rpc,
    recordStore: new KademliaRecordStore(),
    replicationFactor: 2,
    writeQuorum: 2
  });

  const result = await manager.put(record, { replicationFactor: 2, minAcks: 2 });

  assert.equal(walkedTarget, 'durability:acknowledged-write');
  assert.equal(result.acknowledgements, 2);
  assert.deepEqual(result.storedAt, [publisher.nodeId, holder.nodeId]);
  assert.deepEqual(storedRemotely, [{ peer: holder.nodeId, recordId: record.recordId }]);
  assert.equal(result.lookup.attempted, true);
});

test('DHT replicated read expands keyspace and resolves a holder absent from the initial routing view', async () => {
  const reader = createIdentity();
  const publisher = createIdentity();
  const holder = createIdentity();
  const record = createDhtRecord({
    identity: publisher,
    namespace: 'durability',
    key: 'post-restart-retention',
    value: { retained: true },
    ttlMs: 120_000
  });
  let expanded = false;
  let findCalls = 0;
  const discovery = {
    identity: reader,
    closest(target) {
      assert.equal(dhtId(target), record.keyHash, 'read target must match the signed DHT key hash');
      return expanded ? [{ nodeId: holder.nodeId }] : [];
    },
    async walk(target, options) {
      assert.equal(target, 'durability:post-restart-retention');
      assert.deepEqual(options, { maxRounds: 4, stopOnFound: false });
      expanded = true;
      return { queried: ['bridge-peer'], rounds: 1, responses: 1 };
    }
  };
  const rpc = {
    async findValue(peer, namespace, key) {
      findCalls += 1;
      assert.equal(peer.nodeId, holder.nodeId);
      assert.equal(namespace, 'durability');
      assert.equal(key, 'post-restart-retention');
      return { records: [record] };
    },
    forget() {}
  };
  const localStore = new KademliaRecordStore();
  const manager = new DhtReplicationManager({ discovery, rpc, recordStore: localStore });

  const result = await manager.get('durability', 'post-restart-retention', { fanout: 1 });

  assert.equal(findCalls, 1);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].recordId, record.recordId);
  assert.equal(localStore.get('durability', 'post-restart-retention').length, 1, 'successful remote resolution must seed local repair state');
  assert.equal(result.lookup.attempted, true);
});

test('remote dht.store ACK is emitted only after the durability barrier succeeds', async () => {
  const publisher = createIdentity();
  const receiver = createIdentity();
  const record = createDhtRecord({
    identity: publisher,
    namespace: 'durability',
    key: 'remote-ack',
    value: { persisted: true },
    ttlMs: 120_000
  });
  const store = new KademliaRecordStore();
  let persisted = false;
  const discovery = {
    k: 20,
    identity: receiver,
    closest: () => [],
    get: () => null
  };
  const handler = createQuicDiscoveryControlHandler(discovery, {
    recordStore: store,
    persistRecordStore: async () => {
      await Promise.resolve();
      persisted = true;
    }
  });

  const ack = await handler(QUIC_DHT_METHOD_STORE, { record }, { peerNodeId: publisher.nodeId });

  assert.equal(persisted, true);
  assert.equal(ack.stored, true);
  assert.equal(ack.durable, true);
  assert.equal(ack.recordId, record.recordId);
  assert.equal(store.get('durability', 'remote-ack').length, 1);
});

test('remote dht.store fails closed when durability cannot be established', async () => {
  const publisher = createIdentity();
  const receiver = createIdentity();
  const record = createDhtRecord({
    identity: publisher,
    namespace: 'durability',
    key: 'failed-durable-ack',
    value: { persisted: false },
    ttlMs: 120_000
  });
  const discovery = {
    k: 20,
    identity: receiver,
    closest: () => [],
    get: () => null
  };
  const handler = createQuicDiscoveryControlHandler(discovery, {
    recordStore: new KademliaRecordStore(),
    persistRecordStore: async () => { throw new Error('simulated_fsync_failure'); }
  });

  await assert.rejects(
    handler(QUIC_DHT_METHOD_STORE, { record }, { peerNodeId: publisher.nodeId }),
    /simulated_fsync_failure/
  );
});

test('DHT lookup rounds remain explicitly bounded', async () => {
  const identity = createIdentity();
  const manager = new DhtReplicationManager({
    discovery: { identity, closest: () => [], walk: async () => ({ queried: [], rounds: 0, responses: 0 }) },
    rpc: { forget() {} },
    recordStore: new KademliaRecordStore()
  });

  await assert.rejects(
    manager.get('durability', 'invalid-rounds', { lookupRounds: 65 }),
    /lookupRounds must be between 0 and 64/
  );
});
