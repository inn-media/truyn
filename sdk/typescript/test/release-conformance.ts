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
  const cancelReceipt = await requester.need(capability, { cancel: true });
  await requester.runtime.revoke(cancelReceipt.needId, 'sdk_conformance_cancel', { targetKind: 'need' });
  process.stdout.write('PASS typescript developer-release conformance\n');
} finally {
  provider.close();
  requester.close();
}
