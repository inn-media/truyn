import test from 'node:test';
import assert from 'node:assert/strict';
import { createA2aClient } from '../adapters/a2a/client.js';
import { A2A_PROTOCOL_VERSION, A2A_TASK_STATES } from '../adapters/a2a/mapping.js';
import {
  A2A_INTEGRITY_METADATA_KEY,
  A2A_SOURCE_URL_METADATA_KEY,
  canonicalA2aJson,
  normalizeOutboundA2aPart,
  normalizeVerifiedRemotePart
} from '../adapters/a2a/artifact-integrity.js';

const HELLO_SHA256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function agentCard(interfaceUrl) {
  return {
    name: 'C6 hardening agent',
    description: 'C6 hardening fixture',
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [{ id: 'artifact', name: 'Artifact', description: 'Artifact fixture', inputModes: ['text/plain'], outputModes: ['text/plain'] }],
    supportedInterfaces: [{ url: interfaceUrl, protocolBinding: 'JSONRPC', protocolVersion: A2A_PROTOCOL_VERSION }]
  };
}

test('C6 canonical JSON preserves own __proto__ keys in the integrity domain', () => {
  const withProtoKey = JSON.parse('{"ok":true,"__proto__":{"admin":true}}');
  const canonical = canonicalA2aJson(withProtoKey);
  assert.equal(canonical, '{"__proto__":{"admin":true},"ok":true}');
  assert.notEqual(canonical, canonicalA2aJson({ ok: true }));
});

test('C6 strips spoofed sourceUrl from inline remote parts', async () => {
  const part = await normalizeVerifiedRemotePart({
    raw: 'aGVsbG8=',
    metadata: { [A2A_SOURCE_URL_METADATA_KEY]: 'https://evil.example/spoof' }
  }, { maxArtifactBytes: 1024 });
  assert.equal(part.metadata[A2A_SOURCE_URL_METADATA_KEY], undefined);
  assert.equal(part.metadata[A2A_INTEGRITY_METADATA_KEY].digest, HELLO_SHA256);
});

test('C6 rejects oversized outbound URL integrity claims before dispatch', () => {
  assert.throws(() => normalizeOutboundA2aPart({
    url: 'https://files.example.test/large.bin',
    metadata: {
      [A2A_INTEGRITY_METADATA_KEY]: {
        algorithm: 'sha256',
        digest: HELLO_SHA256,
        sizeBytes: 5,
        encoding: 'raw',
        verified: true
      }
    }
  }, { maxArtifactBytes: 4 }), (error) => error.code === 'A2A_ARTIFACT_TOO_LARGE');
});

test('C6 normalizes outbound SendMessage parts before the one remote execution', async () => {
  const cardUrl = 'http://127.0.0.1:7789/.well-known/agent-card.json';
  const interfaceUrl = 'http://127.0.0.1:7789/a2a';
  let sends = 0;
  let outboundPart = null;
  const fetchImpl = async (url, init = {}) => {
    if (String(url) === cardUrl && init.method === 'GET') return jsonResponse(agentCard(interfaceUrl));
    const rpc = JSON.parse(init.body);
    assert.equal(rpc.method, 'SendMessage');
    sends += 1;
    outboundPart = rpc.params.message.parts[0];
    return jsonResponse({
      jsonrpc: '2.0',
      id: rpc.id,
      result: { message: { messageId: 'result-1', role: 'ROLE_AGENT', parts: [{ text: 'ok' }] } }
    });
  };
  const client = createA2aClient({ agentCardUrl: cardUrl, fetchImpl });
  const result = await client.execute({ skill: { id: 'artifact' }, message: { messageId: 'm1', role: 'ROLE_USER', parts: [{ text: 'hello' }] } });
  assert.equal(result.output, 'ok');
  assert.equal(sends, 1);
  assert.equal(outboundPart.metadata[A2A_INTEGRITY_METADATA_KEY].digest, HELLO_SHA256);
  assert.equal(outboundPart.metadata[A2A_INTEGRITY_METADATA_KEY].verified, true);
});

test('C6 bounds total remote task parts before any URL resolver execution', async () => {
  const cardUrl = 'http://127.0.0.1:7790/.well-known/agent-card.json';
  const interfaceUrl = 'http://127.0.0.1:7790/a2a';
  const urls = (count, prefix) => Array.from({ length: count }, (_, index) => ({ url: `https://files.example.test/${prefix}-${index}.bin` }));
  let resolverCalls = 0;
  const fetchImpl = async (url, init = {}) => {
    if (String(url) === cardUrl && init.method === 'GET') return jsonResponse(agentCard(interfaceUrl));
    const rpc = JSON.parse(init.body);
    return jsonResponse({
      jsonrpc: '2.0',
      id: rpc.id,
      result: {
        task: {
          id: 'task-many',
          contextId: 'context-many',
          status: { state: A2A_TASK_STATES.completed },
          artifacts: [
            { artifactId: 'a', parts: urls(33, 'a') },
            { artifactId: 'b', parts: urls(32, 'b') }
          ]
        }
      }
    });
  };
  const client = createA2aClient({
    agentCardUrl: cardUrl,
    fetchImpl,
    resolveArtifactUrl: async () => {
      resolverCalls += 1;
      return Buffer.from('hello');
    }
  });
  await assert.rejects(
    client.execute({ skill: { id: 'artifact' }, message: { messageId: 'm2', role: 'ROLE_USER', parts: [{ text: 'go' }] } }),
    /remote artifact part limit/
  );
  assert.equal(resolverCalls, 0);
});
