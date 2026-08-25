import assert from 'node:assert/strict';
import test from 'node:test';
import { createRelay } from '../../../network/relay/server.js';
import { TruynLocalNodeClient } from '../src/local-node.ts';

test('TypeScript SDK local-node E2E completes verified NEED -> RESULT through the real relay runtime', async () => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  const provider = await TruynLocalNodeClient.connect({ relayUrl, name: 'SDK E2E Provider' });
  const requester = await TruynLocalNodeClient.connect({ relayUrl, name: 'SDK E2E Requester' });

  try {
    assert.notEqual(provider.nodeId, requester.nodeId);

    await provider.offer('sdk.echo', { description: 'DX-1 local SDK E2E capability' });

    const receipt = await requester.need('sdk.echo', { text: 'hello from SDK' }, { purpose: 'dx1-pr5' });
    assert.equal(receipt.ok, true);
    assert.equal(receipt.provider, provider.nodeId);
    assert.ok(receipt.needId);

    const need = await provider.nextNeed({ timeoutMs: 2_000 });
    assert.equal(need.needId, receipt.needId);
    assert.equal(need.requester, requester.nodeId);
    assert.equal(need.capability, 'sdk.echo');
    assert.deepEqual(need.input, { text: 'hello from SDK' });
    assert.deepEqual(need.policy, { purpose: 'dx1-pr5' });
    assert.equal(need.verification.ok, true);

    await provider.result(need.needId, {
      text: `echo:${(need.input as { text: string }).text}`
    }, {
      e2e: 'dx1-pr5'
    });

    const result = await requester.waitForResult(receipt.needId, { timeoutMs: 2_000 });
    assert.equal(result.needId, receipt.needId);
    assert.equal(result.provider, provider.nodeId);
    assert.deepEqual(result.output, { text: 'echo:hello from SDK' });
    assert.deepEqual(result.metadata, { e2e: 'dx1-pr5' });
    assert.equal(result.verification.ok, true);
  } finally {
    requester.close();
    provider.close();
    await relay.close();
  }
});
