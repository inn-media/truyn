import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const runner = new URL('../sdk/conformance/run-conformance.mjs', import.meta.url);
const manifestUrl = new URL('../sdk/conformance/languages.json', import.meta.url);

const requiredLanguages = ['typescript', 'python', 'go', 'java', 'dotnet'];
const dx3Features = [
  'streaming',
  'cancellation',
  'object_artifact_payloads',
  'stable_sdk_api',
  'external_developer_docs'
];

async function runConformance(args = []) {
  const { stdout } = await execFileAsync(process.execPath, [runner.pathname, '--json', ...args], {
    cwd: new URL('..', import.meta.url).pathname
  });
  return JSON.parse(stdout);
}

test('DX conformance matrix covers all required first-party SDK languages', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  assert.deepEqual(manifest.requiredFirstPartyLanguages, requiredLanguages);
  assert.deepEqual(manifest.languages.map((language) => language.id), requiredLanguages);
  assert.deepEqual(manifest.dx3StableApiFeatures, dx3Features);
  assert.equal(manifest.languages.find((language) => language.id === 'typescript').status, 'dx3-stable-api-reference');
  assert.equal(manifest.languages.find((language) => language.id === 'python').status, 'dx3-stable-api-reference');
  assert.equal(manifest.languages.find((language) => language.id === 'go').status, 'dx3-stable-api-skeleton');
  assert.equal(manifest.languages.find((language) => language.id === 'java').status, 'dx3-stable-api-skeleton');
  assert.equal(manifest.languages.find((language) => language.id === 'dotnet').status, 'dx3-stable-api-skeleton');
  assert.equal(manifest.languages.every((language) => language.publicDistribution === false), true);
  for (const dto of ['ArtifactPayload', 'NeedRequest', 'ResultResponse', 'StreamEvent']) {
    assert.ok(manifest.foundationalDtos.includes(dto), `${dto} must be a foundational DX-3 DTO`);
  }
});

test('unified SDK conformance runner validates every SDK target', async () => {
  const result = await runConformance();
  assert.equal(result.ok, true);
  assert.equal(result.fixtureSet, 'truyn.sdk-conformance/v1');
  assert.equal(result.protocol, 'TRUYN/1');
  assert.deepEqual(result.languages.map((language) => language.id), requiredLanguages);
  for (const language of result.languages) {
    assert.ok(language.files > 0, `${language.id} must declare source files`);
    assert.ok(language.markers > 0, `${language.id} must declare conformance markers`);
  }
});

test('unified SDK conformance runner supports language-scoped validation', async () => {
  for (const language of ['go', 'java', 'dotnet']) {
    const result = await runConformance([`--language=${language}`]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.languages.map((entry) => entry.id), [language]);
    assert.equal(result.languages[0].status, 'dx3-stable-api-skeleton');
  }
});
