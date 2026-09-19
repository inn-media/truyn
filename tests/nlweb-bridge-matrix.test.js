import assert from 'node:assert/strict';
import test from 'node:test';

import { NLWEB_BRIDGE_MATRIX, assertNlwebBridgeMatrix, getNlwebBridge } from '../adapters/nlweb/bridge-matrix.js';

test('S88 bridge matrix covers ASK and WHO over REST, MCP and A2A exactly once', () => {
  assert.equal(assertNlwebBridgeMatrix(), true);
  assert.equal(NLWEB_BRIDGE_MATRIX.length, 6);
  assert.deepEqual(
    NLWEB_BRIDGE_MATRIX.map(({ operation, surface }) => `${operation}:${surface}`).sort(),
    ['ask:a2a', 'ask:mcp', 'ask:rest', 'who:a2a', 'who:mcp', 'who:rest']
  );
});

test('S88 every bridge preserves canonical authority and provenance invariants', () => {
  for (const entry of NLWEB_BRIDGE_MATRIX) {
    assert.equal(entry.authority, 'canonical-truyn');
    assert.equal(entry.provenance, 'preserved');
    assert.equal(entry.capability, `nlweb.${entry.operation}`);
    assert.equal(entry.visibility, entry.operation === 'who' ? 'pre-return-filtered' : 'canonical-dispatch');
    assert.equal(Object.isFrozen(entry), true);
  }
  assert.equal(Object.isFrozen(NLWEB_BRIDGE_MATRIX), true);
});

test('S88 bridge lookup is bounded to declared operation/surface cells', () => {
  assert.equal(getNlwebBridge({ operation: 'ask', surface: 'rest' }).capability, 'nlweb.ask');
  assert.equal(getNlwebBridge({ operation: 'who', surface: 'mcp' }).visibility, 'pre-return-filtered');
  assert.throws(() => getNlwebBridge({ operation: 'execute', surface: 'rest' }), /operation must be ask or who/);
  assert.throws(() => getNlwebBridge({ operation: 'ask', surface: 'private-shortcut' }), /surface must be rest, mcp or a2a/);
});
