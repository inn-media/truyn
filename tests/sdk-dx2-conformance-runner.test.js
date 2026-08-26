import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const runner = new URL('../sdk/conformance/run-conformance.mjs', import.meta.url);
const manifestUrl = new URL('../sdk/conformance/languages.json', import.meta.url);

const requiredLanguages = ['typescript', 'python', 'go', 'java', 'dotnet'];
const referenceLanguages = ['typescript', 'python'];
const portablePayloadLanguages = ['go', 'java', 'dotnet'];

async function runConformance(args = []) {
  const { stdout } = await execFileAsync(process.execPath, [runner.pathname, '--json', ...args], {
    cwd: new URL('..', import.meta.url).pathname
  });
  return JSON.parse(stdout);
}

test('DX-3 conformance matrix covers all required first-party SDK languages', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  assert.deepEqual(manifest.requiredFirstPartyLanguages, requiredLanguages);
  assert.deepEqual(manifest.languages.map((language) => language.id), requiredLanguages);
  assert.equal(manifest.stableSdkApiVersion, '1');
  assert.deepEqual(manifest.dx3PortablePayloadKinds, ['object', 'artifact']);
  for (const language of referenceLanguages) {
    assert.equal(manifest.languages.find((entry) => entry.id === language).status, 'implemented-dx3-reference-surface');
  }
  for (const language of portablePayloadLanguages) {
    assert.equal(manifest.languages.find((entry) => entry.id === language).status, 'dx3-portable-payload-surface');
  }
  assert.equal(manifest.languages.every((language) => language.publicDistribution === false), true);
});

test('unified SDK conformance runner validates every DX-3 SDK target', async () => {
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

test('unified SDK conformance runner supports DX-3 language-scoped validation', async () => {
  for (const language of portablePayloadLanguages) {
    const result = await runConformance([`--language=${language}`]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.languages.map((entry) => entry.id), [language]);
    assert.equal(result.languages[0].status, 'dx3-portable-payload-surface');
  }
});
