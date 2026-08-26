import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repoRoot = new URL('..', import.meta.url);
const docsIndexUrl = new URL('../docs/developers/README.md', import.meta.url);
const sdkApiUrl = new URL('../docs/developers/sdk-api.md', import.meta.url);
const manifestUrl = new URL('../sdk/conformance/languages.json', import.meta.url);

const expectedFeatures = [
  'streaming',
  'cancellation',
  'object_artifact_payloads',
  'stable_sdk_api',
  'external_developer_docs'
];

const expectedDtos = ['ArtifactPayload', 'NeedRequest', 'ResultResponse', 'StreamEvent'];

test('DX-3 developer docs expose stable SDK API entrypoint', async () => {
  const [index, api] = await Promise.all([
    readFile(docsIndexUrl, 'utf8'),
    readFile(sdkApiUrl, 'utf8')
  ]);

  assert.match(index, /TRUYN developer docs/);
  assert.match(index, /Stable SDK API/);
  assert.match(index, /private\/internal/);

  for (const token of [
    'Streaming',
    'Cancellation',
    'Object/artifact payloads',
    'ArtifactPayload',
    'NeedRequest',
    'ResultResponse',
    'StreamEvent',
    'AbortSignal',
    'CancellationToken',
    'context.Context',
    'IAsyncEnumerable<StreamEvent>'
  ]) {
    assert.ok(api.includes(token), `developer API docs missing ${token}`);
  }
});

test('DX-3 stable API markers are separate from wire/runtime contracts', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  assert.deepEqual(manifest.dx3StableApiFeatures, expectedFeatures);
  assert.deepEqual(manifest.dx3StableApiDtos, expectedDtos);

  for (const language of manifest.languages) {
    assert.equal(language.publicDistribution, false, `${language.id} must remain internal before stable release`);
    for (const dto of expectedDtos) {
      assert.ok(
        language.requiredMarkers.some((marker) => marker.includes(dto)),
        `${language.id} must expose ${dto}`
      );
    }
  }

  assert.equal(manifest.dx3StableApiFeatures.includes('D-1000'), false);
  assert.equal(manifest.dx3StableApiFeatures.includes('network_runtime'), false);
});
