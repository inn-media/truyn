import test from 'node:test';
import assert from 'node:assert/strict';
import {
  A2A_MCP_COMPATIBILITY,
  A2A_MCP_COMPATIBILITY_GENERATION,
  negotiateA2aMcpCompatibility
} from '../adapters/compatibility/a2a-mcp.js';

test('P3-M2 adds bounded prompt semantics only to the modern MCP import profile', () => {
  const result = negotiateA2aMcpCompatibility({
    protocol: 'mcp',
    direction: 'import',
    version: '2026-07-28',
    requiredSemantics: [
      'prompts-list',
      'prompts-get',
      'prompt-object-v1',
      'prompt-list-subscriptions-listen-v1',
      'prompt-explicit-refresh-v1',
      'prompt-explicit-mrtr-v1',
      'prompt-untrusted-data-boundary-v1',
      'authorization-boundary',
      'exactly-once-remote-execution'
    ]
  });
  assert.equal(result.generation, 'a2a-mcp-pre-v1/g1');
  assert.equal(result.status, 'bounded-pre-v1');
  assert.equal(A2A_MCP_COMPATIBILITY_GENERATION, 'a2a-mcp-pre-v1/g1');
  assert.ok(A2A_MCP_COMPATIBILITY.mcp.promisedSurfaces.some((entry) => entry.includes('prompt import')));
});

test('P3-M2 does not promote legacy MCP import versions or prompt publication/completion/apps', () => {
  for (const version of ['2025-11-25', '2025-06-18']) {
    assert.throws(() => negotiateA2aMcpCompatibility({
      protocol: 'mcp',
      direction: 'import',
      version,
      requiredSemantics: ['prompts-list']
    }), (error) => error?.code === 'INTEROP_VERSION_UNSUPPORTED');
  }

  for (const semantic of ['arbitrary-mcp-prompts', 'mcp-prompt-facade-publication', 'mcp-prompt-completion', 'mcp-apps-extensions']) {
    assert.throws(() => negotiateA2aMcpCompatibility({
      protocol: 'mcp',
      direction: 'import',
      version: '2026-07-28',
      requiredSemantics: [semantic]
    }), (error) => error?.code === 'INTEROP_REQUIRED_SEMANTIC_UNSUPPORTED');
  }
});

test('P3-M2 leaves the MCP facade/server profile unchanged', () => {
  assert.throws(() => negotiateA2aMcpCompatibility({
    protocol: 'mcp',
    direction: 'facade',
    version: '2026-07-28',
    requiredSemantics: ['prompts-list', 'prompts-get']
  }), (error) => error?.code === 'INTEROP_REQUIRED_SEMANTIC_UNSUPPORTED');

  const toolFacade = negotiateA2aMcpCompatibility({
    protocol: 'mcp',
    direction: 'facade',
    version: '2026-07-28',
    requiredSemantics: ['tools-list', 'tools-call', 'authorization-boundary']
  });
  assert.equal(toolFacade.generation, 'a2a-mcp-pre-v1/g1');
});
