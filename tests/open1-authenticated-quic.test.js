import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAuthenticatedTransport } from '../core/network/authenticated-transport.js';

const peer = {
  id: 'peer-a',
  endpoints: [
    { transport: 'https', url: 'https://peer.example/fallback' },
    { transport: 'quic', url: 'quic://peer.example:4433' }
  ]
};

test('S146 successful direct probe selects and records authenticated QUIC first', async () => {
  const calls = [];
  const selected = await selectAuthenticatedTransport({
    peer,
    probeQuic: async ({ endpoint }) => {
      calls.push(endpoint.url);
      return { reachable: true, authenticated: true, connection: { id: 'q1' } };
    }
  });
  assert.deepEqual(calls, ['quic://peer.example:4433']);
  assert.equal(selected.transport, 'quic');
  assert.equal(selected.endpoint.url, 'quic://peer.example:4433');
  assert.equal(selected.authenticated, true);
  assert.deepEqual(selected.connection, { id: 'q1' });
});

test('S146 does not accept reachable QUIC without authentication', async () => {
  await assert.rejects(
    selectAuthenticatedTransport({ peer, probeQuic: async () => ({ reachable: true, authenticated: false }) }),
    /authentication failed/
  );
});

test('S146 fails closed when direct QUIC is unavailable', async () => {
  await assert.rejects(
    selectAuthenticatedTransport({ peer, probeQuic: async () => ({ reachable: false }) }),
    /no reachable authenticated QUIC endpoint/
  );
});
