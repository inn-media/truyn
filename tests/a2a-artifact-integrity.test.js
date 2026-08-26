import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createIdentity } from '../core/identity/index.js';
import { createProviderAccessPolicy } from '../core/security/provider-access.js';
import { createRelay } from '../network/relay/server.js';
import { TruynNode } from '../node/client.js';
import { createFunctionAdapter, TruynAdapterHost } from '../adapters/sdk/index.js';
import { createA2aServer } from '../adapters/a2a/server.js';
import { createA2aClient } from '../adapters/a2a/client.js';
import { A2A_PROTOCOL_VERSION, A2A_TASK_STATES, artifactsFromTruynResult } from '../adapters/a2a/mapping.js';
import { createA2aDiscoveryProvider } from '../adapters/providers/a2a-discovery.js';
import {
  A2A_INTEGRITY_METADATA_KEY,
  A2A_SOURCE_URL_METADATA_KEY,
  canonicalA2aJson,
  createA2aArtifactBundle,
  normalizeVerifiedRemotePart
} from '../adapters/a2a/artifact-integrity.js';
import { A2aTaskStore } from '../adapters/a2a/task-store.js';

const HELLO_SHA256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function card(interfaceUrl) {
  return {
    name: 'C6 artifact agent',
    description: 'C6 artifact integrity test agent',
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain', 'application/json', 'application/octet-stream'],
    skills: [{
      id: 'artifact',
      name: 'Artifact',
      description: 'Returns verified artifacts',
      inputModes: ['text/plain'],
      outputModes: ['text/plain', 'application/json', 'application/octet-stream']
    }],
    supportedInterfaces: [{ url: interfaceUrl, protocolBinding: 'JSONRPC', protocolVersion: A2A_PROTOCOL_VERSION }]
  };
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function createCompletedFetch(artifacts) {
  const interfaceUrl = 'http://127.0.0.1:7788/a2a';
  const cardUrl = 'http://127.0.0.1:7788/.well-known/agent-card.json';
  return {
    cardUrl,
    fetchImpl: async (url, init = {}) => {
      if (String(url) === cardUrl && init.method === 'GET') return jsonResponse(card(interfaceUrl));
      if (String(url) !== interfaceUrl || init.method !== 'POST') return new Response('', { status: 404 });
      const request = JSON.parse(init.body);
      assert.equal(init.headers['a2a-version'], A2A_PROTOCOL_VERSION);
      assert.equal(request.method, 'SendMessage');
      return jsonResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          task: {
            id: 'task-c6',
            contextId: 'context-c6',
            status: { state: A2A_TASK_STATES.completed },
            artifacts
          }
        }
      });
    }
  };
}

async function createNetwork(t) {
  const relay = createRelay({ localDevelopmentMode: false, allowPublicRegistration: true, allowPublicDispatch: true });
  const relayUrl = await relay.listen({ port: 0 });
  t.after(() => relay.close());
  return { relayUrl };
}

test('C6 computes deterministic SHA-256 for text, canonical JSON, and raw bytes', async () => {
  const text = await normalizeVerifiedRemotePart({ text: 'hello', mediaType: 'text/plain' }, { maxArtifactBytes: 1024 });
  assert.deepEqual(text.metadata[A2A_INTEGRITY_METADATA_KEY], {
    algorithm: 'sha256',
    digest: HELLO_SHA256,
    sizeBytes: 5,
    encoding: 'utf8',
    verified: true
  });

  assert.equal(canonicalA2aJson({ b: 2, a: 1 }), canonicalA2aJson({ a: 1, b: 2 }));
  const dataA = await normalizeVerifiedRemotePart({ data: { b: 2, a: 1 }, mediaType: 'application/json' }, { maxArtifactBytes: 1024 });
  const dataB = await normalizeVerifiedRemotePart({ data: { a: 1, b: 2 }, mediaType: 'application/json' }, { maxArtifactBytes: 1024 });
  assert.equal(dataA.metadata[A2A_INTEGRITY_METADATA_KEY].digest, dataB.metadata[A2A_INTEGRITY_METADATA_KEY].digest);
  assert.equal(dataA.metadata[A2A_INTEGRITY_METADATA_KEY].digest, sha256(Buffer.from('{"a":1,"b":2}', 'utf8')));
  assert.equal(dataA.metadata[A2A_INTEGRITY_METADATA_KEY].encoding, 'truyn-json-c14n-v1');

  const raw = await normalizeVerifiedRemotePart({ raw: 'aGVsbG8=', filename: 'hello.bin', mediaType: 'application/octet-stream' }, { maxArtifactBytes: 1024 });
  assert.equal(raw.raw, 'aGVsbG8=');
  assert.equal(raw.metadata[A2A_INTEGRITY_METADATA_KEY].digest, HELLO_SHA256);
  assert.equal(raw.metadata[A2A_INTEGRITY_METADATA_KEY].encoding, 'raw');
});

test('C6 rejects tampered digest and malformed raw content fail-closed', async () => {
  await assert.rejects(
    normalizeVerifiedRemotePart({
      raw: 'aGVsbG8=',
      metadata: {
        [A2A_INTEGRITY_METADATA_KEY]: {
          algorithm: 'sha256',
          digest: '0'.repeat(64),
          sizeBytes: 5,
          encoding: 'raw'
        }
      }
    }, { maxArtifactBytes: 1024 }),
    (error) => error.code === 'A2A_ARTIFACT_INTEGRITY_MISMATCH'
  );

  await assert.rejects(
    normalizeVerifiedRemotePart({ raw: 'not-base64***' }, { maxArtifactBytes: 1024 }),
    (error) => error.code === 'A2A_ARTIFACT_RAW_INVALID'
  );
});

test('C6 URL files require an explicit resolver and are materialized to verified raw bytes', async () => {
  const part = {
    url: 'https://files.example.test/report.bin',
    filename: 'report.bin',
    mediaType: 'application/octet-stream'
  };
  await assert.rejects(
    normalizeVerifiedRemotePart(part, { maxArtifactBytes: 1024 }),
    (error) => error.code === 'A2A_ARTIFACT_URL_UNVERIFIED'
  );

  let resolverCalls = 0;
  const resolved = await normalizeVerifiedRemotePart(part, {
    maxArtifactBytes: 1024,
    resolveArtifactUrl: async ({ url }) => {
      resolverCalls += 1;
      assert.equal(url, part.url);
      return Buffer.from('hello');
    }
  });
  assert.equal(resolverCalls, 1);
  assert.equal(resolved.raw, 'aGVsbG8=');
  assert.equal(resolved.metadata[A2A_SOURCE_URL_METADATA_KEY], part.url);
  assert.equal(resolved.metadata[A2A_INTEGRITY_METADATA_KEY].digest, HELLO_SHA256);
  assert.equal(resolved.metadata[A2A_INTEGRITY_METADATA_KEY].verified, true);
});

test('C6 client preserves text/JSON compatibility while exposing verified multipart files and integrity evidence', async () => {
  const remote = createCompletedFetch([{
    artifactId: 'artifact-c6',
    name: 'mixed artifact',
    parts: [
      { text: 'hello', mediaType: 'text/plain' },
      { data: { b: 2, a: 1 }, mediaType: 'application/json' },
      { raw: 'aGVsbG8=', filename: 'hello.bin', mediaType: 'application/octet-stream' }
    ]
  }]);
  const client = createA2aClient({ agentCardUrl: remote.cardUrl, fetchImpl: remote.fetchImpl });
  const result = await client.execute({
    skill: { id: 'artifact' },
    message: { messageId: 'message-c6', role: 'ROLE_USER', parts: [{ text: 'go' }] }
  });

  assert.equal(result.output.parts.length, 3);
  assert.equal(result.output.parts[0].text, 'hello');
  assert.deepEqual(result.output.parts[1].data, { b: 2, a: 1 });
  assert.equal(result.output.parts[2].raw, 'aGVsbG8=');
  assert.equal(result.output.parts[2].metadata[A2A_INTEGRITY_METADATA_KEY].digest, HELLO_SHA256);
  assert.equal(result.metadata.interoperability.artifactCount, 1);
  assert.equal(result.metadata.interoperability.artifactIntegrity[0].artifactId, 'artifact-c6');
  assert.equal(result.metadata.interoperability.artifactIntegrity[0].parts.length, 3);
});

test('C6 explicit TRUYN artifact bundle maps to A2A artifacts and cannot spoof TRUYN provenance', () => {
  const output = createA2aArtifactBundle([{
    artifactId: 'bundle-a',
    name: 'bundle',
    metadata: { 'io.truyn/provenance': { protocol: 'spoofed' }, custom: 'kept' },
    parts: [
      { text: 'hello', mediaType: 'text/plain' },
      { data: { ok: true }, mediaType: 'application/json' },
      { raw: 'aGVsbG8=', filename: 'hello.bin', mediaType: 'application/octet-stream' },
      {
        url: 'https://files.example.test/immutable.bin',
        filename: 'immutable.bin',
        mediaType: 'application/octet-stream',
        metadata: {
          [A2A_INTEGRITY_METADATA_KEY]: {
            algorithm: 'sha256',
            digest: HELLO_SHA256,
            sizeBytes: 5,
            encoding: 'raw',
            verified: true
          }
        }
      }
    ]
  }]);

  const artifacts = artifactsFromTruynResult(output, {
    requestId: 'request-c6',
    providerNodeId: 'provider-c6',
    trust: { score: 1 },
    metadata: { adapter: 'c6-test' }
  });
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].artifactId, 'bundle-a');
  assert.equal(artifacts[0].parts.length, 4);
  assert.equal(artifacts[0].parts[0].metadata[A2A_INTEGRITY_METADATA_KEY].digest, HELLO_SHA256);
  assert.equal(artifacts[0].parts[2].metadata[A2A_INTEGRITY_METADATA_KEY].digest, HELLO_SHA256);
  assert.equal(artifacts[0].metadata.custom, 'kept');
  assert.equal(artifacts[0].metadata['io.truyn/provenance'].protocol, 'TRUYN/1');
  assert.equal(artifacts[0].metadata['io.truyn/provenance'].requestId, 'request-c6');
  assert.equal(artifacts[0].metadata['io.truyn/provenance'].providerNodeId, 'provider-c6');
});

test('C6 task store converts invalid provider artifact output into FAILED with zero artifacts', () => {
  const store = new A2aTaskStore();
  const task = store.create({
    message: { messageId: 'm', role: 'ROLE_USER', parts: [{ text: 'x' }] },
    skill: { id: 's', capability: 'c' }
  });
  store.start(task.id, { truynRequestId: 'request-bad', providerNodeId: 'provider-bad' });
  store.completeFromTruynEvent({
    kind: 'RESULT',
    verification: { ok: true },
    trust: { score: 1 },
    envelope: {
      from: 'provider-bad',
      payload: {
        requestId: 'request-bad',
        output: createA2aArtifactBundle([{
          artifactId: 'bad',
          parts: [{ raw: '***corrupt***' }]
        }]),
        metadata: {}
      }
    }
  });
  const snapshot = store.snapshot(task);
  assert.equal(snapshot.status.state, A2A_TASK_STATES.failed);
  assert.equal(snapshot.artifacts, undefined);
  assert.equal(snapshot.status.message.metadata['io.truyn/errorCode'], 'A2A_ARTIFACT_RAW_INVALID');
});

test('C6 real C3 → TRUYN provider → Artifact → C6 importer round-trip preserves mixed parts and integrity', async (t) => {
  const { relayUrl } = await createNetwork(t);
  const providerNode = new TruynNode({ relayUrl, identity: createIdentity() });
  const providerHost = new TruynAdapterHost({
    node: providerNode,
    adapter: createFunctionAdapter({
      name: 'c6-native-provider',
      capabilities: ['remote.c6'],
      execute: async () => ({
        output: createA2aArtifactBundle([{
          artifactId: 'remote-artifact-c6',
          name: 'C6 mixed result',
          parts: [
            { text: 'hello', mediaType: 'text/plain' },
            { data: { answer: 42 }, mediaType: 'application/json' },
            { raw: 'aGVsbG8=', filename: 'hello.bin', mediaType: 'application/octet-stream' }
          ]
        }])
      })
    }),
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    pollIntervalMs: 2
  });
  await providerHost.start();
  t.after(() => providerHost.stop());

  const facadeNode = new TruynNode({ relayUrl, identity: createIdentity() });
  const facade = createA2aServer({
    node: facadeNode,
    agent: {
      name: 'C6 remote facade',
      description: 'C6 real integration facade',
      version: '1.0.0'
    },
    skills: [{
      id: 'mixed',
      name: 'Mixed',
      description: 'Returns mixed artifacts',
      capability: 'remote.c6',
      visibility: 'public',
      inputModes: ['text/plain'],
      outputModes: ['text/plain', 'application/json', 'application/octet-stream']
    }],
    pollIntervalMs: 2
  });
  const facadeUrl = await facade.listen({ port: 0 });
  t.after(() => facade.close());

  const adapter = await createA2aDiscoveryProvider({
    agentCardUrl: `${facadeUrl}/.well-known/agent-card.json`,
    allowSkills: ['mixed']
  });
  const importedNode = new TruynNode({ relayUrl, identity: createIdentity() });
  const importedHost = new TruynAdapterHost({
    node: importedNode,
    adapter,
    accessPolicy: createProviderAccessPolicy({ mode: 'public' }),
    pollIntervalMs: 2
  });
  await importedHost.publishCapabilities();

  const requester = new TruynNode({ relayUrl, identity: createIdentity() });
  await requester.register();
  await requester.need('a2a.mixed', 'produce mixed artifact');
  const handled = await importedHost.runOnce();
  assert.equal(handled.handled, 1);
  const events = (await requester.poll()).events;
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'RESULT');
  const output = events[0].envelope.payload.output;
  assert.equal(output.parts.length, 3);
  assert.equal(output.parts[0].text, 'hello');
  assert.deepEqual(output.parts[1].data, { answer: 42 });
  assert.equal(output.parts[2].raw, 'aGVsbG8=');
  assert.equal(output.parts[2].metadata[A2A_INTEGRITY_METADATA_KEY].digest, HELLO_SHA256);
  assert.equal(events[0].envelope.payload.metadata.interoperability.artifactIntegrity[0].artifactId, 'remote-artifact-c6');
});
