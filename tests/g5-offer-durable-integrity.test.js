import assert from 'node:assert/strict';
import test from 'node:test';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';

// Fault-injected shared durable OFFER authority. Unlike a caller-controlled
// OFFER, this row survives a relay epoch and is authoritative for dispatch.
function durableAuthority() {
  const rows = new Map();
  return {
    kind: 'cosmos-multi-host-v1',
    rows,
    async getOffer(id) { return rows.get(id) || null; },
    async getNeed() { return null; }, // No NEED admitted; test rejects before reservation.
    async reserveOffer({ id, owner, fingerprint }) {
      if (rows.has(id)) throw Error('unexpected duplicate OFFER');
      const row = { id, owner, fingerprint, revoked: 0 };
      rows.set(id, row);
      return row;
    }
  };
}

async function getOffers(node, capability) {
  const response = await fetch(node.relayUrl +
    '/v1/offers?capability=' + encodeURIComponent(capability), {
    headers: node.authHeaders()
  });
  return { status: response.status, body: await response.json() };
}

test('G5 P6: durable owner and immutable signed OFFER fingerprint gate matching and dispatch', async t => {
  const authority = durableAuthority();
  const relay = createRelay({ localDevelopmentMode: true, lifecycleLedger: authority });
  t.after(() => relay.close());
  const relayUrl = await relay.listen({ port: 0 });
  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  const posted = await provider.offer('g5.offer.integrity');
  const baseline = await getOffers(requester, 'g5.offer.integrity');
  assert.equal(baseline.status, 200);
  assert.equal(baseline.body.offers.length, 1);

  const offerId = posted.offerId || baseline.body.offers[0].id;
  const row = authority.rows.get(offerId);
  assert.ok(row);
  assert.equal(row.owner, provider.identity.nodeId);
  const acceptedFingerprint = row.fingerprint;

  // A corrupt or cross-tenant record is NOT a valid local discovery hint.
  row.owner = 'truyn:node:forged-owner';
  let result = await getOffers(requester, 'g5.offer.integrity');
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'lifecycle_offer_integrity_mismatch');

  row.owner = provider.identity.nodeId;
  row.fingerprint = 'tampered-envelope-fingerprint';
  result = await getOffers(requester, 'g5.offer.integrity');
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'lifecycle_offer_integrity_mismatch');

  const envelope = requester.envelope('NEED', {
    capability: { name: 'g5.offer.integrity' }, input: { test: true }, policy: {}
  }, { id: 'g5-offer-fingerprint-reject-need-1' });
  const denied = await fetch(relayUrl + '/v1/needs', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...requester.authHeaders() },
    body: JSON.stringify({ envelope })
  });
  assert.equal(denied.status, 503, 'a fingerprint mismatch must block NEED before dispatch');
  assert.equal((await provider.poll()).events.length, 0);

  // Correct fingerprint restores local visibility; durable withdrawal removes it.
  row.fingerprint = acceptedFingerprint;
  result = await getOffers(requester, 'g5.offer.integrity');
  assert.equal(result.status, 200);
  assert.equal(result.body.offers.length, 1);
  row.revoked = 1;
  assert.equal((await getOffers(requester, 'g5.offer.integrity')).body.offers.length, 0);
});

test('G5 P6: non-dispatching owner cannot read an OFFER whose durable binding changed', async t => {
  const authority = durableAuthority();
  const relay = createRelay({
    allowPublicRegistration: true, allowPublicDispatch: false,
    lifecycleLedger: authority
  });
  t.after(() => relay.close());
  const relayUrl = await relay.listen({ port: 0 });
  const owner = new TruynNode({ relayUrl });
  await owner.register();
  const posted = await owner.offer('g5.offer.own');
  const accepted = await getOffers(owner, 'g5.offer.own');
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.offers.length, 1);
  const row = authority.rows.get(posted.offerId || accepted.body.offers[0].id);
  assert.ok(row);
  row.owner = 'other-owner';
  const forged = await getOffers(owner, 'g5.offer.own');
  assert.equal(forged.status, 503);
  assert.equal(forged.body.error, 'lifecycle_offer_integrity_mismatch');
});

test('G5 P6: missing shared Cosmos OFFER must not fall back to in-memory OFFER', async t => {
  const authority = durableAuthority();
  const relay = createRelay({ localDevelopmentMode: true, lifecycleLedger: authority });
  t.after(() => relay.close());
  const relayUrl = await relay.listen({ port: 0 });
  const provider = new TruynNode({ relayUrl });
  const requester = new TruynNode({ relayUrl });
  await provider.register();
  await requester.register();
  const offer = await provider.offer('g5.offer.missing');
  const before = await getOffers(requester, 'g5.offer.missing');
  assert.equal(before.body.offers.length, 1);
  authority.rows.delete(offer.offerId || before.body.offers[0].id);
  const missing = await getOffers(requester, 'g5.offer.missing');
  assert.equal(missing.status, 200);
  assert.equal(missing.body.offers.length, 0);
});
