import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createIdentity } from '../core/identity/index.js';
import { TruynNetworkNode } from '../network/runtime.js';

async function generateTls(root) {
  const keyPath = join(root, 'key.pem');
  const certPath = join(root, 'cert.pem');
  const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-days', '1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`openssl failed: ${run.stderr}`);
  return { key: await readFile(keyPath, 'utf8'), cert: await readFile(certPath, 'utf8') };
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// D-5000 Attempt 6 post-restart signature: a source still holding the target's
// pre-restart record dispatches NEED over a fresh QUIC connection to the restarted
// process (same endpoint), then learns the target's new generation while the
// envelope is in flight. The generation change must retire that connection for
// reuse, not cancel the request that is already being served by the live process.
test('restarted target: learning its new generation does not kill an in-flight NEED', { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-p2p-generation-'));
  const tls = await generateTls(root);
  const base = { host: '127.0.0.1', tls, peerRecordTtlMs: 600_000, discoveryPeriodicRefresh: false, peerRecordPublishFanout: 0 };
  const targetIdentity = createIdentity();
  const targetState = join(root, 'target-state.json');
  const source = new TruynNetworkNode({ identity: createIdentity(), ...base });
  let target = new TruynNetworkNode({ identity: targetIdentity, statePath: targetState, ...base });
  let handled = 0;
  try {
    const firstGeneration = await target.start();
    await source.start();
    source.discovery.ingest(firstGeneration);
    const port = target.quic.port;
    await target.close();

    target = new TruynNetworkNode({ identity: targetIdentity, statePath: targetState, ...base, port });
    target.onEnvelope(async (message) => {
      handled += 1;
      await sleep(400);
      return { ok: true, echo: message.payload?.input ?? null, to: targetIdentity.nodeId };
    });
    const secondGeneration = await target.start();
    assert.equal(secondGeneration.endpoints[0], firstGeneration.endpoints[0], 'restart keeps the endpoint');
    assert.notEqual(secondGeneration.instanceId, firstGeneration.instanceId, 'restart mints a new process generation');
    assert.equal(source.discovery.get(targetIdentity.nodeId)?.instanceId, firstGeneration.instanceId, 'source still holds the pre-restart record');

    const need = source.need(targetIdentity.nodeId, 'testnet.echo', { probe: 'post-restart' }, {}, { allowRelayFallback: false });
    const outcome = need.then((value) => ({ value }), (error) => ({ error }));
    const deadline = Date.now() + 5_000;
    while (handled === 0 && Date.now() < deadline) await sleep(5);
    assert.equal(handled, 1, 'the restarted process received the NEED');

    // The new generation arrives while the envelope is in flight (late lookup reply,
    // announce, lease ping). This used to destroy the connection under the request.
    assert.equal(source.discovery.ingest(secondGeneration).accepted, true);

    const settled = await outcome;
    if ('error' in settled) {
      // Pre-fix behaviour: the pooled QUIC client was destroyed under the request and
      // the promise rejected with `null` -> HTTP 500 "testnet_control_error".
      const error = settled.error;
      assert.fail(`in-flight NEED was cancelled by the generation change: rejection=${error === null ? 'null' : error?.constructor?.name} code=${error?.code ?? ''} message=${error?.message ?? ''}`);
    }
    assert.equal(settled.value.transport, 'quic-direct');
    assert.equal(settled.value.result.to, targetIdentity.nodeId);
    assert.equal(handled, 1, 'exactly one application dispatch');

    // The retired pre-restart binding is never reused: the next NEED binds to the new generation.
    const next = await source.need(targetIdentity.nodeId, 'testnet.echo', { probe: 'after' }, {}, { allowRelayFallback: false });
    assert.equal(next.transport, 'quic-direct');
    assert.equal(handled, 2);
  } finally {
    await Promise.allSettled([source.close(), target.close()]);
    await rm(root, { recursive: true, force: true });
  }
});
