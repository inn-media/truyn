import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from '../network/relay/server.js';

test('relay keeps HTTP command connections alive across provider execution', async (t) => {
  const relay = createRelay({ localDevelopmentMode: true });
  t.after(() => relay.close());
  await relay.listen({ port: 0 });

  assert.equal(relay.server.keepAliveTimeout, 60_000);
  assert.equal(relay.server.headersTimeout, 65_000);
  assert.ok(relay.server.headersTimeout > relay.server.keepAliveTimeout);
});

test('relay command keep-alive remains bounded and configurable', async (t) => {
  const relay = createRelay({
    localDevelopmentMode: true,
    commandKeepAliveTimeoutMs: 20_000,
    commandHeadersTimeoutMs: 25_000
  });
  t.after(() => relay.close());
  await relay.listen({ port: 0 });

  assert.equal(relay.server.keepAliveTimeout, 20_000);
  assert.equal(relay.server.headersTimeout, 25_000);
});

test('relay rejects unsafe command timeout ordering', () => {
  assert.throws(
    () => createRelay({ localDevelopmentMode: true, commandKeepAliveTimeoutMs: 20_000, commandHeadersTimeoutMs: 20_000 }),
    /commandHeadersTimeoutMs must exceed commandKeepAliveTimeoutMs/
  );
});
