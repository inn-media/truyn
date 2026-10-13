import assert from 'node:assert/strict';
import { TruynClient } from '../src/client.ts';
import { TruynLocalNodeClient } from '../src/local-node.ts';

const relayUrl = process.argv[2];
if (!relayUrl) throw new Error('relay URL is required');
const descriptorUrl = process.env.TRUYN_CONFORMANCE_DESCRIPTOR_URL;
const descriptorPublicKey = process.env.TRUYN_CONFORMANCE_DESCRIPTOR_PUBLIC_KEY;
const descriptorIdentity = process.env.TRUYN_CONFORMANCE_DESCRIPTOR_IDENTITY;
if (!descriptorUrl || !descriptorPublicKey || !descriptorIdentity) throw new Error('descriptor conformance fixture is required');

const descriptorClient = new TruynClient({ relayUrl });
const verifiedDescriptor = await descriptorClient.fetchAgentDescriptor(descriptorUrl, { publicKeyPem: descriptorPublicKey });
assert.equal(verifiedDescriptor.descriptor.identity, descriptorIdentity);
assert.equal(verifiedDescriptor.selection.protocol, 'TRUYN/1');
assert.equal(verifiedDescriptor.selection.interface.type, 'https');
assert.equal(verifiedDescriptor.signer.keyBinding, 'identity');

const provider = await TruynLocalNodeClient.connect({ relayUrl, name: 'typescript-provider' });
const requester = await TruynLocalNodeClient.connect({ relayUrl, name: 'typescript-requester' });
try {
  const capability = `sdk.release.typescript.${Date.now()}.${Math.random()}`;
  await provider.offer(capability, { language: 'typescript' });
  const receipt = await requester.need(capability, { question: 'hello' });
  const need = await provider.nextNeed({ timeoutMs: 5_000 });
  assert.equal(need.needId, receipt.needId);
  assert.equal(need.requester, requester.nodeId);
  assert.equal(need.capability, capability);
  await provider.result(need.needId, { ok: true, language: 'typescript' });
  const result = await requester.waitForResult(receipt.needId, { timeoutMs: 5_000 });
  assert.equal(result.provider, provider.nodeId);
  assert.equal(result.verification.ok, true);
  // The five-SDK exact-head G5 fixture uses a durable ledger. No auto-ACK.
  const requesterRecovery = new TruynClient({ relayUrl, sessionToken: requester.runtime.sessionToken });
  const pending = await requesterRecovery.recoverDurable();
  assert.equal(pending.filter(e=>e.eventId==='result:'+receipt.needId).length,1);
  assert.equal((await requesterRecovery.recoverDurable()).some(e=>e.eventId==='result:'+receipt.needId),true);
  const receiptAck = await requesterRecovery.acknowledgeDurable('result:'+receipt.needId);
  assert.equal(receiptAck.acknowledged,true);
  assert.equal((await requesterRecovery.recoverDurable()).some(e=>e.eventId==='result:'+receipt.needId),false);
  const cancelReceipt = await requester.need(capability, { cancel: true });
  await requester.runtime.revoke(cancelReceipt.needId, 'sdk_conformance_cancel', { targetKind: 'need' });
  // Real native C/P/D package-source signing. Context persists as immutable CIDs.
  const baseContext: any = await requester.putContext([{ id: 'seed', text: 'original' }]);
  assert.equal(baseContext.ok, true);
  assert.equal(typeof baseContext.cid, 'string');
  const childContext: any = await requester.deltaContext(baseContext.cid, [{ op: 'replace', id: 'seed', text: 'changed' }]);
  assert.equal(childContext.ok, true);
  assert.equal(childContext.baseCid, baseContext.cid);
  assert.notEqual(childContext.cid, baseContext.cid);
  await assert.rejects(() => provider.deltaContext(baseContext.cid, [{ op: 'replace', id: 'seed', text: 'unauthorized' }]), /context_owner_required|403/);
  await assert.rejects(() => requester.compactChain([{ capability: { name: 'missing-stage-1' } }, { capability: { name: 'missing-stage-2' } }]), /no_matching_provider|404/);
  const chainTask: Promise<any> = requester.compactChain([{ capability: { name: capability } }, { capability: { name: capability } }]) as Promise<any>;
  for (let n = 0; n < 2; n++) {
    let stage: any;
    for (let attempt = 0; attempt < 8 && !stage; attempt++) {
      const events = await provider.pollCompact({ waitMs: 2000 });
      stage = events.find((e: any) => e.kind === 'CHAIN_STAGE');
    }
    assert.ok(stage && stage.verification.ok === true, 'signed CHAIN_STAGE required');
    if (n) assert.equal(stage.priorVerification.ok, true);
    await provider.runtime.compactResult(stage.requestId, { stage: n });
  }
  const finished = await chainTask;
  assert.equal(finished.ok, true);
  assert.equal(finished.results.length, 2);
  process.stdout.write('PASS typescript developer-release conformance\n');
} finally {
  provider.close();
  requester.close();
}
