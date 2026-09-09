import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8'));
}

const matrix = readJson('docs/compatibility/MCP_STABLE_V1_INTEROPERABILITY_MATRIX.json');
const profile = readJson('spec/compatibility/mcp-stable-v1.json');

test('stable MCP status is independent from TRUYN, A2A, and aggregate status', () => {
  assert.deepEqual(profile.statusDimensions, {
    truyn: { generation: 'TRUYN/1', status: 'draft' },
    a2a: { status: 'bounded-pre-v1' },
    mcp: { status: 'stable-v1', profile: 'mcp-stable-v1/p1' },
    aggregate: { generation: 'a2a-mcp-pre-v1/g1', status: 'bounded-pre-v1' }
  });
  assert.deepEqual(matrix.promotionBoundary.mayPromote, ['mcp']);
  assert.deepEqual(matrix.promotionBoundary.mustRemainUnchanged, ['truyn', 'a2a', 'aggregate']);
});

test('stable MCP profile is bound to the accepted post-P3-M3 matrix and exact source identities', () => {
  assert.equal(profile.frozenBaselineSha, '45474df58ec5ee30090fae4700905175c27b40cf');
  assert.equal(profile.frozenMatrix, 'docs/compatibility/MCP_STABLE_V1_INTEROPERABILITY_MATRIX.json');
  assert.equal(matrix.frozenFrom.mergedMainSha, profile.frozenBaselineSha);
  assert.equal(profile.scope.protocol, 'mcp');
  assert.equal(profile.scope.direction, 'import');
  assert.equal(profile.scope.transportProtocolVersion, '2026-07-28');
  assert.equal(profile.scope.apps.extensionId, 'io.modelcontextprotocol/ui');
  assert.equal(profile.scope.apps.upstreamPackage, '@modelcontextprotocol/ext-apps');
  assert.equal(profile.scope.apps.upstreamSourceVersion, '2.0.0');
  assert.equal(profile.scope.apps.upstreamCommit, '4cd427394755ee0964172df5760852aa053a5c99');
});

test('stable MCP required semantics are explicit, versioned, and duplicate-free', () => {
  assert.equal(profile.scope.requiredSemanticsVersion, 1);
  assert.ok(profile.scope.requiredSemantics.length >= 10);
  assert.equal(new Set(profile.scope.requiredSemantics).size, profile.scope.requiredSemantics.length);
  assert.ok(profile.scope.requiredSemantics.includes('tools/list-and-call'));
  assert.ok(profile.scope.requiredSemantics.includes('resources/list-and-read'));
  assert.ok(profile.scope.requiredSemantics.includes('prompts/list-and-get'));
  assert.ok(profile.scope.requiredSemantics.includes('apps-ui-extension/io.modelcontextprotocol/ui'));
  assert.ok(profile.scope.requiredSemantics.includes('apps-ui-untrusted-presentation-boundary'));
});

test('unknown required stable-profile behavior fails closed and optional fallback cannot expand authority', () => {
  assert.equal(profile.fallback.unknownRequiredProtocolVersion, 'fail-closed');
  assert.equal(profile.fallback.unknownRequiredExtension, 'fail-closed');
  assert.equal(profile.fallback.unknownRequiredSemantic, 'fail-closed');
  assert.equal(
    profile.fallback.unknownOptionalExtension,
    'ignore-without-authority-or-behavior-expansion'
  );
  assert.equal(
    profile.fallback.unknownOptionalSemantic,
    'ignore-without-authority-or-behavior-expansion'
  );
  assert.equal(
    profile.fallback.serverWithoutApps,
    'continue-supported-non-apps-mcp-without-apps-inference'
  );
  assert.equal(profile.fallback.legacyOrFacadeAppsRequired, 'fail-closed');
});

test('migration from g1 is opt-in and does not promote legacy or non-MCP status dimensions', () => {
  assert.equal(profile.migration.from, 'a2a-mcp-pre-v1/g1');
  assert.equal(profile.migration.rule, 'opt-in-profile-selection');
  assert.equal(profile.migration.legacyDefaultRemains, 'a2a-mcp-pre-v1/g1');
  assert.equal(profile.migration.legacyBehaviorPromotion, false);
  assert.equal(profile.migration.a2aPromotion, false);
  assert.equal(profile.migration.truynPromotion, false);
  assert.equal(profile.migration.aggregatePromotion, false);
});

test('UI remains presentation-only under the promoted MCP profile', () => {
  assert.deepEqual(profile.authorityBoundary, {
    uiContentIsPresentationOnly: true,
    authorizationFromUi: false,
    providerSelectionFromUi: false,
    billingFromUi: false,
    entitlementFromUi: false,
    executionAuthorityFromUi: false,
    provenanceAuthorityFromUi: false,
    implicitExternalFetchFromUi: false
  });
});
