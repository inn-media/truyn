import test from 'node:test';
import assert from 'node:assert/strict';
import {
  A2A_MCP_COMPATIBILITY,
  A2A_MCP_COMPATIBILITY_GENERATION,
  negotiateA2aMcpCompatibility
} from '../adapters/compatibility/a2a-mcp.js';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { MCP_RESOURCE_OBJECT_PROFILE } from '../adapters/mcp/resource-runtime.js';

test('P3-M1 general MCP resource semantics are additive to bounded pre-v1 g1 import compatibility', () => {
  assert.equal(A2A_MCP_COMPATIBILITY_GENERATION, 'a2a-mcp-pre-v1/g1');
  assert.equal(A2A_MCP_COMPATIBILITY.status, 'bounded-pre-v1');
  assert.equal(A2A_MCP_COMPATIBILITY.truyn.status, 'draft');
  assert.equal(MCP_RESOURCE_OBJECT_PROFILE, 'mcp-resource-object-state/v1');

  const required = [
    'resources-list',
    'resources-templates-list',
    'resources-read',
    'resource-object-state-v1',
    'resource-subscriptions-listen-v1',
    'resource-update-explicit-reread-v1',
    'resource-provider-authority-correlation-v1'
  ];
  const negotiated = negotiateA2aMcpCompatibility({
    protocol: 'mcp',
    direction: 'import',
    version: MCP_CURRENT_PROTOCOL_VERSION,
    requiredSemantics: required
  });
  assert.deepEqual(negotiated.requiredSemantics, required);
  assert.equal(negotiated.version, '2026-07-28');
  assert.ok(A2A_MCP_COMPATIBILITY.mcp.promisedSurfaces.includes('bounded general resource import -> TRUYN OBJECT/STATE'));
  assert.ok(!A2A_MCP_COMPATIBILITY.excludedOptionalSurfaces.includes('arbitrary-mcp-resources'));
  assert.ok(A2A_MCP_COMPATIBILITY.excludedOptionalSurfaces.includes('arbitrary-mcp-resource-publication'));
});

test('P3-M1 does not accidentally promote Prompts, Apps, resource publication, or legacy outbound MCP', () => {
  for (const semantic of ['arbitrary-mcp-prompts', 'mcp-apps-extensions', 'arbitrary-mcp-resource-publication']) {
    assert.throws(() => negotiateA2aMcpCompatibility({
      protocol: 'mcp',
      direction: 'import',
      version: MCP_CURRENT_PROTOCOL_VERSION,
      requiredSemantics: [semantic]
    }), (error) => error.code === 'INTEROP_REQUIRED_SEMANTIC_UNSUPPORTED');
  }

  for (const legacy of A2A_MCP_COMPATIBILITY.mcp.legacyFacadeProfiles) {
    assert.throws(() => negotiateA2aMcpCompatibility({
      protocol: 'mcp',
      direction: 'import',
      version: legacy,
      requiredSemantics: ['resources-read']
    }), (error) => error.code === 'INTEROP_VERSION_UNSUPPORTED');
  }
});
