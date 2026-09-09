import test from 'node:test';
import assert from 'node:assert/strict';
import {
  A2A_MCP_COMPATIBILITY_GENERATION,
  negotiateA2aMcpCompatibility
} from '../adapters/compatibility/a2a-mcp.js';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { MCP_UI_EXTENSION_ID } from '../adapters/mcp/capabilities.js';

function captureCompatibilityError(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  assert.fail('expected compatibility error');
}

test('P3-M3 fails closed with a deterministic compatibility error for an unknown required extension', () => {
  const unknown = 'example.invalid/required-ui-v9';
  const error = captureCompatibilityError(() => negotiateA2aMcpCompatibility({
    protocol: 'mcp',
    direction: 'import',
    version: MCP_CURRENT_PROTOCOL_VERSION,
    requiredExtensions: [unknown]
  }));

  assert.equal(error.code, 'INTEROP_REQUIRED_EXTENSION_UNSUPPORTED');
  assert.equal(error.message, `Unsupported required MCP extensions: ${unknown}`);
  assert.deepEqual(error.compatibility, {
    generation: A2A_MCP_COMPATIBILITY_GENERATION,
    protocol: 'mcp',
    direction: 'import',
    version: MCP_CURRENT_PROTOCOL_VERSION,
    unsupportedRequiredExtensions: [unknown]
  });
});

test('P3-M3 preserves deterministic fail-closed behavior for an unknown required semantic', () => {
  const semantic = 'mcp-apps-unimplemented-semantic-v9';
  const error = captureCompatibilityError(() => negotiateA2aMcpCompatibility({
    protocol: 'mcp',
    direction: 'import',
    version: MCP_CURRENT_PROTOCOL_VERSION,
    requiredSemantics: [semantic]
  }));

  assert.equal(error.code, 'INTEROP_REQUIRED_SEMANTIC_UNSUPPORTED');
  assert.equal(error.message, `Unsupported required interoperability semantics: ${semantic}`);
  assert.deepEqual(error.compatibility.unsupportedRequired, [semantic]);
});

test('recognizing the UI extension id does not promote unimplemented Apps semantics', () => {
  const recognized = negotiateA2aMcpCompatibility({
    protocol: 'mcp',
    direction: 'import',
    version: MCP_CURRENT_PROTOCOL_VERSION,
    requiredExtensions: [MCP_UI_EXTENSION_ID],
    optionalExtensions: ['example.invalid/optional-future']
  });

  assert.deepEqual(recognized.requiredExtensions, [MCP_UI_EXTENSION_ID]);
  assert.deepEqual(recognized.ignoredOptionalExtensions, ['example.invalid/optional-future']);

  const error = captureCompatibilityError(() => negotiateA2aMcpCompatibility({
    protocol: 'mcp',
    direction: 'import',
    version: MCP_CURRENT_PROTOCOL_VERSION,
    requiredExtensions: [MCP_UI_EXTENSION_ID],
    requiredSemantics: ['mcp-apps-extension-v1']
  }));
  assert.equal(error.code, 'INTEROP_REQUIRED_SEMANTIC_UNSUPPORTED');
});
