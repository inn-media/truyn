import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const PIN = '4cd427394755ee0964172df5760852aa053a5c99';
const PROVENANCE_PATH = new URL('./fixtures/pinned-ext-apps-v2.provenance.json', import.meta.url);
const FIXTURE_PATH = new URL('./fixtures/pinned-ext-apps-v2-server.mjs', import.meta.url);

test('P3-M3 independent Apps fixture is tied reproducibly to the exact upstream pin', async () => {
  const provenance = JSON.parse(await readFile(PROVENANCE_PATH, 'utf8'));
  const fixture = await readFile(FIXTURE_PATH, 'utf8');

  assert.equal(provenance.fixtureProfile, 'p3-m3-independent-ext-apps-wire/v1');
  assert.deepEqual(provenance.independence, {
    importsTruynImplementation: false,
    importsTruynFixtureHelpers: false,
    behaviorSource: 'exact pinned upstream MCP Apps source/specification'
  });
  assert.deepEqual(provenance.upstream, {
    package: '@modelcontextprotocol/ext-apps',
    sourceVersion: '2.0.0',
    repository: 'https://github.com/modelcontextprotocol/ext-apps',
    commit: PIN,
    exactSourceUrls: [
      `https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/${PIN}/package.json`,
      `https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/${PIN}/src/constants.ts`,
      `https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/${PIN}/src/server/index.ts`,
      `https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/${PIN}/specification/draft/apps.mdx`
    ]
  });
  assert.deepEqual(provenance.upstreamFactsUsed, {
    extensionId: 'io.modelcontextprotocol/ui',
    toolMetadataField: '_meta.ui.resourceUri',
    visibilityValues: ['model', 'app'],
    visibilityDefault: ['model', 'app'],
    resourceScheme: 'ui://',
    resourceMime: 'text/html;profile=mcp-app',
    resourceReadRule: 'Host uses MCP resources/read for the referenced resource URI'
  });
  assert.equal(provenance.transportContext.truynModernMcpImportProfile, '2026-07-28');
  assert.match(provenance.transportContext.note, /separately from the ext-apps source version/);

  assert.equal(fixture.includes("from '../adapters/"), false);
  assert.equal(fixture.includes('from "../adapters/'), false);
  assert.equal(fixture.includes('tests/fixtures/official-'), false);
  assert.match(fixture, /@modelcontextprotocol\/ext-apps/);
  assert.match(fixture, new RegExp(PIN));
  assert.match(fixture, /io\.modelcontextprotocol\/ui/);
  assert.match(fixture, /text\/html;profile=mcp-app/);
  assert.match(fixture, /ui:\/\/pinned-ext-apps\/weather\.html/);
});
