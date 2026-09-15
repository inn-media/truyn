import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createHttpAdapterServer } from '../adapters/http/server.js';

test('REST preserves the canonical signed NEED id through runtime and RESULT correlation without making HTTP correlation authority', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());

  const requester = new TruynNode({ relayUrl });
  const provider = new TruynNode({ relayUrl });
  await provider.register({ name: 'correlation-provider' });
  await provider.offer('correlation.echo');

  const bridge = createHttpAdapterServer({ node: requester });
  const baseUrl = await bridge.listen({ port: 0 });
  t.after(() => bridge.close());

  const diagnosticCorrelation = 'rest-diagnostic-not-authority';
  const response = await fetch(`${baseUrl}/v1/need`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': diagnosticCorrelation
    },
    body: JSON.stringify({ capability: 'correlation.echo', input: { value: 7 } })
  });
  assert.equal(response.status, 200);
  const need = await response.json();
  assert.equal(need.ok, true);
  assert.equal(typeof need.needId, 'string');
  assert.ok(need.needId.length > 0);
  assert.notEqual(need.needId, diagnosticCorrelation, 'HTTP diagnostic correlation must not choose the signed TRUYN request id');

  const providerEvents = await provider.poll();
  const deliveredNeed = providerEvents.events.find((event) => event.kind === 'NEED');
  assert.ok(deliveredNeed, 'provider must receive the canonical NEED');
  assert.equal(deliveredNeed.envelope.id, need.needId, 'runtime delivery must preserve the signed NEED id');

  await provider.result(need.needId, { answer: 7 }, { source: 's45-correlation' });

  const statusResponse = await fetch(`${baseUrl}/v1/needs/${encodeURIComponent(need.needId)}`);
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json();
  assert.equal(status.requestId, need.needId);
  assert.equal(status.result.envelope.payload.requestId, need.needId, 'RESULT metadata must correlate to the same canonical request id');
  assert.deepEqual(status.result.envelope.payload.metadata, { source: 's45-correlation' });
  assert.deepEqual(status.result.envelope.payload.output, { answer: 7 });
});
