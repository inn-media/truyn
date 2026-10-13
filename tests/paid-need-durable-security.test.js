import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createIdentity } from '../core/identity/index.js';
import { createCosmosLifecycleLedger } from '../network/relay/cosmos-lifecycle-ledger.js';
import { configureRelayProviderGrantAuthority } from '../core/security/relay-provider-policy.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createProviderBillingPolicy } from '../core/security/provider-billing.js';
import { TruynAdapterHost, createFunctionAdapter } from '../adapters/sdk/index.js';
import { verifyPaidNeedAtProvider } from '../core/security/paid-need-admission.js';

function sharedCosmos() {
  const documents = new Map();
  let serial = 0, available = true;
  const response = (status, value, etag) => new Response(value === null ? null : JSON.stringify(value), {
    status, headers: { 'content-type': 'application/json', ...(etag ? { etag } : {}) }
  });
  async function fetchImpl(uri, options) {
    if (!available) throw new Error('cosmos_split');
    assert.equal(new URL(uri).hostname, 'paid-fixture.documents.azure.com');
    const key = JSON.parse(options.headers['x-ms-documentdb-partitionkey'])[0];
    if (options.method === 'POST') {
      const row = JSON.parse(options.body);
      if (documents.has(key)) return response(409, { code: 'Conflict' });
      const next = { ...row, _etag: 'v' + ++serial };
      documents.set(key, next);
      return response(201, next, next._etag);
    }
    const saved = documents.get(key);
    if (!saved) return response(404, null);
    if (options.method === 'GET') return response(200, saved, saved._etag);
    if (options.headers['if-match'] !== saved._etag) return response(412, { code: 'PreconditionFailed' });
    const next = { ...JSON.parse(options.body), _etag: 'v' + ++serial };
    documents.set(key, next);
    return response(200, next, next._etag);
  }
  return {
    ledger: () => createCosmosLifecycleLedger({
      endpoint: 'https://paid-fixture.documents.azure.com',
      database: 'truyn', container: 'ledger', getAccessToken: async () => 'test-entra', fetchImpl
    }),
    disconnect: () => { available = false; },
    documents
  };
}
const CAP = 'paid.secure';
function grantFor(providerId, requesterId) {
  return {
    durable: true,
    revision: 7,
    authorize({ providerNodeId, requesterNodeId, capability }) {
      return providerNodeId === providerId && requesterNodeId === requesterId && capability === CAP
        ? { ok: true, mode: 'shared', grantId: 'owner-paid-private-1' }
        : { ok: false, reason: 'not_entitled' };
    },
    getProviderPolicy(providerNodeId) {
      return providerNodeId === providerId ? { status: 'active', mode: 'private' } : null;
    }
  };
}
function buildHost(node, ledger, requesterId, onExecute) {
  return new TruynAdapterHost({
    node, effectLedger: ledger, requirePaidNeedLedger: true,
    accessPolicy: createProviderAccessPolicy({ mode: 'owner-only', allowedRequesterIds: [requesterId] }),
    billingPolicy: createProviderBillingPolicy({ mode: 'owner-funded' }),
    adapter: createFunctionAdapter({ capabilities: [CAP], execute: onExecute })
  });
}
async function setup(t) {
  const providerIdentity = createIdentity(), requesterIdentity = createIdentity(), foreignIdentity = createIdentity();
  const previous = configureRelayProviderGrantAuthority(grantFor(providerIdentity.nodeId, requesterIdentity.nodeId));
  t.after(() => configureRelayProviderGrantAuthority(previous));
  const store = sharedCosmos(), ledger = store.ledger();
  const relay = createRelay({
    allowPublicRegistration: true, allowPublicDispatch: true,
    paidNeedEnforcement: true, lifecycleLedger: ledger
  });
  t.after(() => relay.close());
  const url = await relay.listen({ port: 0 });
  const provider = new TruynNode({ relayUrl: url, identity: providerIdentity });
  const requester = new TruynNode({ relayUrl: url, identity: requesterIdentity });
  const foreign = new TruynNode({ relayUrl: url, identity: foreignIdentity });
  await Promise.all([provider.register(), requester.register(), foreign.register()]);
  await provider.offer(CAP, {
    accessMode: 'public', ownerId: foreignIdentity.nodeId,
    allowedRequesterIds: [foreignIdentity.nodeId]
  });
  return { store, ledger, provider, requester, foreign, providerIdentity, requesterIdentity, foreignIdentity };
}
async function post(node, path, body) {
  const response = await fetch(node.relayUrl + path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...node.authHeaders() },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}
test('mandatory paid runtime refuses absent/non-shared ledger, and relay refuses unpaid authority setup', () => {
  assert.throws(() => createRelay({ paidNeedEnforcement: true }), /shared cross-host Cosmos ledger/);
  const node = { identity: { nodeId: 'provider' } };
  const adapter = createFunctionAdapter({ capabilities: [CAP], execute: async () => ({output: 'should-not-execute'}) });
  assert.throws(() => new TruynAdapterHost({
    node, adapter, requirePaidNeedLedger: true, billingPolicy: createProviderBillingPolicy()
  }), /shared cross-host NEED authorization/);
});
test('foreign signed requester DENIED at relay; owner spoofing cannot spend a single token', { concurrency: false }, async t => {
  const { provider, requester, foreign, ledger, foreignIdentity } = await setup(t);
  let paidCalls = 0;
  const host = buildHost(provider, ledger, requester.identity.nodeId, async () => {
    paidCalls++; return { output: 'spent' };
  });
  const forbidden = foreign.envelope('NEED', {
    capability: { name: CAP },
    input: { ownerId: provider.identity.nodeId, tenantId: 'truyn-owner' },
    policy: { billing: { payerNodeId: provider.identity.nodeId } }
  });
  const denied = await post(foreign, '/v1/needs', { envelope: forbidden });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, 'paid_need_denied');
  const unauthorizedFastPayload = { capability: { name: CAP }, input: { requesterId: provider.identity.nodeId }, policy: {} };
  const deniedFast = await post(foreign, '/v1/fast/needs?waitMs=0', {
    frame: foreign.compactFrame('NEED', unauthorizedFastPayload), payload: unauthorizedFastPayload
  });
  assert.equal(deniedFast.status, 403);
  assert.equal(deniedFast.body.error, 'paid_need_denied');
  const illegalChainPayload = { stages: [{ capability: CAP }, { capability: CAP }] };
  const deniedChain = await post(foreign, '/v1/fast/chains', {
    frame: foreign.compactFrame('CHAIN', illegalChainPayload), payload: illegalChainPayload
  });
  assert.equal(deniedChain.status, 403);
  assert.equal(deniedChain.body.error, 'paid_chain_durable_admission_required');
  assert.equal(paidCalls, 0);
  assert.equal((await provider.poll()).events.length, 0);
  assert.equal(await ledger.getNeed(forbidden.id), null);
  assert.ok(foreignIdentity.nodeId);
  assert.equal(host.requirePaidNeedLedger, true);
});
test('one shared paid NEED survives provider restart and replica race, never double charges', { concurrency: false }, async t => {
  const { provider, requester, ledger, store } = await setup(t);
  let calls = 0;
  const adapterCall = async () => { calls++; return { output: 'paid-result', metadata: { totalTokens: 5 } }; };
  const hostA = buildHost(provider, ledger, requester.identity.nodeId, adapterCall);
  const hostB = buildHost(provider, store.ledger(), requester.identity.nodeId, adapterCall);
  const admitted = await requester.need(CAP, { question: 'prove at most one paid effect' });
  const record = await ledger.getNeed(admitted.needId);
  assert.equal(record.paidAuthorization.contract, 'truyn.paid.need/1');
  assert.equal(record.paidAuthorization.requesterNodeId, requester.identity.nodeId);
  assert.equal(record.paidAuthorization.providerNodeId, provider.identity.nodeId);
  assert.equal(record.paidAuthorization.payerNodeId, provider.identity.nodeId);
  await hostA.runOnce();
  assert.equal(calls, 1);
  const replay = requester.envelope('NEED', { capability: { name: CAP }, input: { question: 'prove at most one paid effect' } }, {id: admitted.needId});
  const sameId = await post(requester, '/v1/needs', {envelope: replay});
  assert.equal(sameId.status, 409);
  // Re-initialize a host and a Cosmos client to simulate replica/restart.
  hostB.sendTerminal = async () => ({ok:true});
  await hostB.executeNeed({
    id: admitted.needId, from: requester.identity.nodeId, paidFingerprint: record.fingerprint,
    payload: { capability: {name:CAP}, input:{question:'prove at most one paid effect'} }
  }, {controller:new AbortController(),nextSequence:0});
  assert.equal(calls, 1);
  assert.equal((await ledger.getEffect(admitted.needId)).status, 'completed');
  assert.equal((await ledger.getEffect(admitted.needId)).observedTokens, 5);
});
test('missing, mismatched or unavailable authoritative payer state blocks provider before upstream', { concurrency: false }, async t => {
  const { provider, requester, ledger, store } = await setup(t);
  let calls = 0;
  const host = buildHost(provider, ledger, requester.identity.nodeId, async () => { calls++; return {output:'spent'}; });
  host.sendTerminal = async () => ({ok:true});
  const fabricated = {id:'attacker-need-no-paid-reservation',from:requester.identity.nodeId,payload:{capability:CAP,input:{}}};
  await host.executeNeed(fabricated, {controller:new AbortController(),nextSequence:0});
  assert.equal(calls,0);
  const result = await requester.need(CAP,{question:'block on outage'});
  const reserved = await ledger.getNeed(result.needId);
  const admitted = {id:result.needId,from:requester.identity.nodeId,paidFingerprint:reserved.fingerprint,payload:{capability:CAP,input:{question:'block on outage'}}};
  await assert.rejects(verifyPaidNeedAtProvider({ledger,need:{...admitted,from:'spoofed'},providerNodeId:provider.identity.nodeId}),e=>e.publicCode==='paid_need_unverified');
  // Even a correctly authenticated ID cannot replace the signed workload.
  await host.executeNeed({...admitted, paidFingerprint: 'a'.repeat(64), payload:{capability:CAP,input:{question:'forged replacement'}}}, {controller:new AbortController(),nextSequence:0});
  assert.equal(calls,0);
  store.disconnect();
  await host.executeNeed(admitted,{controller:new AbortController(),nextSequence:0});
  assert.equal(calls,0);
});

test('two independent provider workers race on the same paid intent: at most one upstream call', { concurrency: false }, async t => {
  const { provider, requester, ledger, store } = await setup(t);
  const admitted = await requester.need(CAP, { input: 'concurrent-same-id' });
  const durable = await ledger.getNeed(admitted.needId);
  let upstream = 0;
  const providerCall = async () => {
    upstream++;
    await new Promise(resolve => setTimeout(resolve, 10));
    return {output:'one-charge'};
  };
  const first = buildHost(provider, ledger, requester.identity.nodeId, providerCall);
  const second = buildHost(provider, store.ledger(), requester.identity.nodeId, providerCall);
  first.sendTerminal = async () => ({ok:true});
  second.sendTerminal = async () => ({ok:true});
  const need = {
    id: admitted.needId, from: requester.identity.nodeId, paidFingerprint: durable.fingerprint,
    payload: {capability: CAP, input: {input:'concurrent-same-id'}}
  };
  const state = () => ({controller:new AbortController(),nextSequence:0});
  await Promise.all([first.executeNeed(need,state()),second.executeNeed(need,state())]);
  assert.equal(upstream,1);
  assert.equal((await ledger.getEffect(admitted.needId)).status,'completed');
});
