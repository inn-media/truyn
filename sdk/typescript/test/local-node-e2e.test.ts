import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRelay } from '../../../network/relay/server.js';
import { TruynLocalNodeClient } from '../src/local-node.ts';

const flow = JSON.parse(readFileSync(new URL('../../conformance/v1/local-node-e2e.json', import.meta.url), 'utf8'));

test('TypeScript SDK local-node E2E completes verified NEED -> RESULT through the real relay runtime', async () => {
  assert.equal(flow.fixtureSet, 'truyn.sdk-conformance/v1');
  assert.equal(flow.contractVersion, 1);
  assert.equal(flow.flowId, 'local-node.need-result/v1');

  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  const provider = await TruynLocalNodeClient.connect({ relayUrl, name: flow.providerName });
  const requester = await TruynLocalNodeClient.connect({ relayUrl, name: flow.requesterName });

  try {
    assert.notEqual(provider.nodeId, requester.nodeId);

    await provider.offer(flow.capabilityId, flow.offerMetadata);

    const receipt = await requester.need(flow.capabilityId, flow.needInput, flow.needPolicy);
    assert.equal(receipt.ok, true);
    assert.equal(receipt.provider, provider.nodeId);
    assert.ok(receipt.needId);

    const need = await provider.nextNeed({ timeoutMs: 2_000 });
    assert.equal(need.needId, receipt.needId);
    assert.equal(need.requester, requester.nodeId);
    assert.equal(need.capability, flow.capabilityId);
    assert.deepEqual(need.input, flow.needInput);
    assert.deepEqual(need.policy, flow.needPolicy);
    assert.equal(need.verification.ok, true);

    const output = {
      text: `${flow.result.outputPrefix}${(need.input as { text: string }).text}`
    };
    assert.deepEqual(output, flow.result.expectedOutput);
    await provider.result(need.needId, output, flow.result.metadata);

    const result = await requester.waitForResult(receipt.needId, { timeoutMs: 2_000 });
    assert.equal(result.needId, receipt.needId);
    assert.equal(result.provider, provider.nodeId);
    assert.deepEqual(result.output, flow.result.expectedOutput);
    assert.deepEqual(result.metadata, flow.result.metadata);
    assert.equal(result.verification.ok, true);
    assert.ok(result.trust);
  } finally {
    requester.close();
    provider.close();
    await relay.close();
  }
});
