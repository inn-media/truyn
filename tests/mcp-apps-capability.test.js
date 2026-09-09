import test from 'node:test';
import assert from 'node:assert/strict';
import { createMcpModernMeta, MCP_CLIENT_CAPABILITIES_META_KEY } from '../adapters/mcp/server.js';
import {
  MCP_EXTENSIONS_CAPABILITY_KEY,
  MCP_UI_EXTENSION_ID,
  hasMcpUiExtensionCapability,
  readMcpUiExtensionCapability
} from '../adapters/mcp/capabilities.js';

test('P3-M3 recognizes the MCP UI extension only when explicitly declared', () => {
  assert.equal(MCP_EXTENSIONS_CAPABILITY_KEY, 'extensions');
  assert.equal(MCP_UI_EXTENSION_ID, 'io.modelcontextprotocol/ui');

  const defaultMeta = createMcpModernMeta();
  const defaultCapabilities = defaultMeta[MCP_CLIENT_CAPABILITIES_META_KEY];
  assert.equal(hasMcpUiExtensionCapability(defaultCapabilities), false);
  assert.deepEqual(readMcpUiExtensionCapability(defaultCapabilities), { declared: false, capability: null });

  assert.equal(hasMcpUiExtensionCapability({ extensions: {} }), false);
  assert.equal(hasMcpUiExtensionCapability({ extensions: { 'example.invalid/other': {} } }), false);

  const explicit = {
    extensions: {
      [MCP_UI_EXTENSION_ID]: {
        mimeTypes: ['text/html;profile=mcp-app']
      }
    }
  };
  assert.equal(hasMcpUiExtensionCapability(explicit), true);
  assert.deepEqual(readMcpUiExtensionCapability(explicit), {
    declared: true,
    capability: { mimeTypes: ['text/html;profile=mcp-app'] }
  });
});

test('P3-M3 does not infer UI support from adjacent metadata and rejects malformed explicit declarations', () => {
  assert.equal(hasMcpUiExtensionCapability({ ui: {} }), false);
  assert.equal(hasMcpUiExtensionCapability({ experimental: { [MCP_UI_EXTENSION_ID]: {} } }), false);
  assert.equal(hasMcpUiExtensionCapability({ extensions: Object.create({ [MCP_UI_EXTENSION_ID]: {} }) }), false);

  assert.throws(() => hasMcpUiExtensionCapability({ extensions: true }), /capabilities\.extensions must be an object/);
  assert.throws(() => hasMcpUiExtensionCapability({ extensions: { [MCP_UI_EXTENSION_ID]: true } }), /must be an object when declared/);
  assert.throws(() => hasMcpUiExtensionCapability(null), /capabilities must be an object/);
});
