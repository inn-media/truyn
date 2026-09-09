import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  A2A_MCP_COMPATIBILITY_GENERATION,
  negotiateA2aMcpCompatibility
} from '../adapters/compatibility/a2a-mcp.js';
import { MCP_CURRENT_PROTOCOL_VERSION } from '../adapters/mcp/client.js';
import { MCP_UI_EXTENSION_ID } from '../adapters/mcp/capabilities.js';
import { MCP_LEGACY_VERSIONS } from '../adapters/mcp/server.js';

const PIN_URL = new URL('../docs/compatibility/MCP_APPS_UPSTREAM_PIN.json', import.meta.url);

function capture(fn) {
  try { return { ok: true, value: fn() }; } catch (error) { return { ok: false, error }; }
}

const SUPPORTED = [
  {
    name: 'modern import with required Apps extension',
    input: {
      protocol: 'mcp', direction: 'import', version: MCP_CURRENT_PROTOCOL_VERSION,
      requiredExtensions: [MCP_UI_EXTENSION_ID]
    },
    requiredExtensions: [MCP_UI_EXTENSION_ID],
    ignoredOptionalExtensions: []
  },
  {
    name: 'modern import without Apps requirement',
    input: { protocol: 'mcp', direction: 'import', version: MCP_CURRENT_PROTOCOL_VERSION },
    requiredExtensions: [],
    ignoredOptionalExtensions: []
  },
  {
    name: 'modern import ignores unknown optional extension',
    input: {
      protocol: 'mcp', direction: 'import', version: MCP_CURRENT_PROTOCOL_VERSION,
      optionalExtensions: ['example.invalid/future-ui']
    },
    requiredExtensions: [],
    ignoredOptionalExtensions: ['example.invalid/future-ui']
  }
];

const UNSUPPORTED = [
  ...MCP_LEGACY_VERSIONS.map((version) => ({
    name: `legacy import ${version} with Apps required`,
    input: {
      protocol: 'mcp', direction: 'import', version,
      requiredExtensions: [MCP_UI_EXTENSION_ID]
    },
    code: 'INTEROP_VERSION_UNSUPPORTED'
  })),
  {
    name: 'modern facade with Apps required',
    input: {
      protocol: 'mcp', direction: 'facade', version: MCP_CURRENT_PROTOCOL_VERSION,
      requiredExtensions: [MCP_UI_EXTENSION_ID]
    },
    code: 'INTEROP_REQUIRED_EXTENSION_UNSUPPORTED'
  },
  {
    name: 'modern import with unknown required extension',
    input: {
      protocol: 'mcp', direction: 'import', version: MCP_CURRENT_PROTOCOL_VERSION,
      requiredExtensions: ['example.invalid/required-ui-v9']
    },
    code: 'INTEROP_REQUIRED_EXTENSION_UNSUPPORTED'
  },
  {
    name: 'future MCP import version with Apps required',
    input: {
      protocol: 'mcp', direction: 'import', version: '2099-01-01',
      requiredExtensions: [MCP_UI_EXTENSION_ID]
    },
    code: 'INTEROP_VERSION_UNSUPPORTED'
  }
];

test('P3-M3 Apps transport/version matrix keeps transport and upstream Apps identities distinct', async (t) => {
  const pin = JSON.parse(await readFile(PIN_URL, 'utf8'));
  assert.equal(MCP_CURRENT_PROTOCOL_VERSION, '2026-07-28');
  assert.equal(pin.mcpProtocolVersion, MCP_CURRENT_PROTOCOL_VERSION);
  assert.equal(pin.package, '@modelcontextprotocol/ext-apps');
  assert.equal(pin.sourcePackageVersion, '2.0.0');
  assert.equal(pin.commit, '4cd427394755ee0964172df5760852aa053a5c99');
  assert.notEqual(pin.sourcePackageVersion, MCP_CURRENT_PROTOCOL_VERSION);

  for (const row of SUPPORTED) {
    await t.test(`PASS: ${row.name}`, () => {
      const first = capture(() => negotiateA2aMcpCompatibility(row.input));
      const second = capture(() => negotiateA2aMcpCompatibility(row.input));
      assert.equal(first.ok, true);
      assert.equal(second.ok, true);
      assert.equal(first.value.generation, A2A_MCP_COMPATIBILITY_GENERATION);
      assert.equal(first.value.protocol, 'mcp');
      assert.equal(first.value.direction, 'import');
      assert.equal(first.value.version, MCP_CURRENT_PROTOCOL_VERSION);
      assert.deepEqual(first.value.requiredExtensions, row.requiredExtensions);
      assert.deepEqual(first.value.ignoredOptionalExtensions, row.ignoredOptionalExtensions);
      assert.deepEqual(second.value, first.value);
    });
  }

  for (const row of UNSUPPORTED) {
    await t.test(`FAIL: ${row.name}`, () => {
      const first = capture(() => negotiateA2aMcpCompatibility(row.input));
      const second = capture(() => negotiateA2aMcpCompatibility(row.input));
      assert.equal(first.ok, false);
      assert.equal(second.ok, false);
      assert.equal(first.error.code, row.code);
      assert.equal(second.error.code, row.code);
      assert.deepEqual(second.error.compatibility, first.error.compatibility);
      assert.equal(second.error.message, first.error.message);
    });
  }
});
