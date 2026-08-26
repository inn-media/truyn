import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TRUYN_SDK_STABLE_API_VERSION,
  TruynError,
  TruynLocalNodeClient,
  createArtifactPayload,
  createObjectPayload,
  streamTruynItems
} from '../src/index.ts';

test('DX-3 stable API exposes object and artifact payloads without embedding artifact bytes', () => {
  assert.equal(TRUYN_SDK_STABLE_API_VERSION, '1');
  assert.deepEqual(createObjectPayload({ answer: 42 }), {
    kind: 'object',
    value: { answer: 42 }
  });

  const artifact = createArtifactPayload({
    ref: 'artifact://sha256/example',
    mediaType: 'image/png',
    bytes: 123,
    sha256: 'A'.repeat(64),
    metadata: { width: 16, height: 16 }
  });
  assert.equal(artifact.kind, 'artifact');
  assert.equal(artifact.bytes, 123);
  assert.equal(artifact.sha256, 'a'.repeat(64));
  assert.equal('data' in artifact, false);
  assert.equal('base64' in artifact, false);
  assert.throws(
    () => createArtifactPayload({ ref: 'artifact://bad', mediaType: 'image/png', sha256: 'not-a-digest' }),
    /sha256/
  );
});

test('DX-3 stream primitive is ordered and abortable', async () => {
  async function* source() {
    yield 'one';
    yield 'two';
  }
  const controller = new AbortController();
  const observed = [];
  for await (const item of streamTruynItems(source(), { signal: controller.signal })) {
    observed.push(item);
  }
  assert.deepEqual(observed, [
    { sequence: 0, item: 'one' },
    { sequence: 1, item: 'two' }
  ]);

  controller.abort(new Error('cancel test'));
  await assert.rejects(async () => {
    for await (const _ of streamTruynItems(source(), { signal: controller.signal })) {
      void _;
    }
  }, /cancel test/);
});

test('local-node event stream consumes relay events and cancellation prevents another poll', async () => {
  let polls = 0;
  const runtime = {
    identity: { nodeId: 'truyn:node:test' },
    need: async () => ({ ok: true, needId: 'need-1', provider: 'provider-1' }),
    poll: async () => {
      polls += 1;
      return {
        events: polls === 1
          ? [{ kind: 'RESULT', verification: { ok: true }, envelope: { from: 'provider-1', payload: { requestId: 'need-1', output: { ok: true } } } }]
          : []
      };
    }
  };
  const client = new TruynLocalNodeClient(runtime);
  const controller = new AbortController();
  const iterator = client.streamEvents({ signal: controller.signal, pollIntervalMs: 1 });
  const first = await iterator.next();
  assert.equal(first.done, false);
  assert.equal(first.value.kind, 'RESULT');
  assert.equal(polls, 1);

  controller.abort('stop');
  await assert.rejects(
    () => iterator.next(),
    (error: unknown) => error instanceof TruynError && error.code === 'cancelled'
  );
  assert.equal(polls, 1, 'abort must prevent an additional relay poll');
});

test('waitForResult aborts before polling when the signal is already cancelled', async () => {
  let polls = 0;
  const runtime = {
    identity: { nodeId: 'truyn:node:test' },
    need: async () => ({ ok: true, needId: 'need-1', provider: 'provider-1' }),
    poll: async () => { polls += 1; return { events: [] }; }
  };
  const client = new TruynLocalNodeClient(runtime);
  const controller = new AbortController();
  controller.abort('user cancelled');
  await assert.rejects(
    () => client.waitForResult('need-1', { signal: controller.signal }),
    (error: unknown) => error instanceof TruynError && error.code === 'cancelled'
  );
  assert.equal(polls, 0);
});
