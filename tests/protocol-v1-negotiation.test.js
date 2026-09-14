import test from 'node:test';
import assert from 'node:assert/strict';
import { negotiateProtocol } from '../core/protocol/negotiation.js';

test('Open 1.0 RC negotiates the highest shared TRUYN generation deterministically', () => {
  const result = negotiateProtocol({
    localProtocols: ['TRUYN/1', 'TRUYN/2'],
    remoteProtocols: ['TRUYN/1', 'TRUYN/2'],
    localSemantics: ['core-envelope', 'revoke-need', 'stream-partial'],
    remoteSemantics: ['core-envelope', 'revoke-need'],
    requiredSemantics: ['core-envelope', 'revoke-need']
  });

  assert.deepEqual(result, {
    ok: true,
    protocol: 'TRUYN/2',
    semantics: ['core-envelope', 'revoke-need']
  });
});

test('Open 1.0 RC negotiation fails closed when no protocol generation overlaps', () => {
  assert.deepEqual(
    negotiateProtocol({ localProtocols: ['TRUYN/1'], remoteProtocols: ['TRUYN/2'] }),
    { ok: false, code: 'version_mismatch', reason: 'no_protocol_overlap' }
  );
});

test('Open 1.0 RC negotiation fails closed when a required semantic is unavailable', () => {
  assert.deepEqual(
    negotiateProtocol({
      localProtocols: ['TRUYN/1'],
      remoteProtocols: ['TRUYN/1'],
      localSemantics: ['core-envelope', 'revoke-need'],
      remoteSemantics: ['core-envelope'],
      requiredSemantics: ['revoke-need', 'core-envelope']
    }),
    {
      ok: false,
      code: 'version_mismatch',
      reason: 'required_semantic_unavailable',
      protocol: 'TRUYN/1',
      missingSemantics: ['revoke-need']
    }
  );
});
