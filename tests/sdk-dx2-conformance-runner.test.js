import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const runner = new URL('../sdk/conformance/run-conformance.mjs', import.meta.url);
const manifestUrl = new URL('../sdk/conformance/languages.json', import.meta.url);

const requiredLanguages = ['typescript', 'python', 'go', 'java', 'dotnet'];
const developerReleaseLanguages = requiredLanguages;

async function runConformance(args = []) {
  const { stdout } = await execFileAsync(process.execPath, [runner.pathname, '--json', ...args], {
    cwd: new URL('..', import.meta.url).pathname
  });
  return JSON.parse(stdout);
}

test('Developer Release conformance matrix covers all required first-party SDK languages', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  assert.deepEqual(manifest.requiredFirstPartyLanguages, requiredLanguages);
  assert.deepEqual(manifest.languages.map((language) => language.id), requiredLanguages);
  assert.equal(manifest.stableSdkApiVersion, '1');
  assert.deepEqual(manifest.dx3PortablePayloadKinds, ['object', 'artifact']);
  assert.equal(manifest.developerReleaseExecutableConformance, 'sdk/conformance/run-five-language-e2e.mjs');
  for (const language of developerReleaseLanguages) {
    const entry = manifest.languages.find((candidate) => candidate.id === language);
    assert.equal(entry.status, 'implemented-developer-release-client');
    assert.equal(entry.publicDistribution, false, `${language} must remain non-public until registry bootstrap completes`);
  }
});

test('unified SDK conformance runner validates every Developer Release SDK target', async () => {
  const result = await runConformance();
  assert.equal(result.ok, true);
  assert.equal(result.fixtureSet, 'truyn.sdk-conformance/v1');
  assert.equal(result.protocol, 'TRUYN/1');
  assert.deepEqual(result.languages.map((language) => language.id), requiredLanguages);
  for (const language of result.languages) {
    assert.equal(language.status, 'implemented-developer-release-client');
    assert.ok(language.files > 0, `${language.id} must declare source files`);
    assert.ok(language.markers > 0, `${language.id} must declare conformance markers`);
  }
});

test('unified SDK conformance runner supports Developer Release language-scoped validation', async () => {
  for (const language of developerReleaseLanguages) {
    const result = await runConformance([`--language=${language}`]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.languages.map((entry) => entry.id), [language]);
    assert.equal(result.languages[0].status, 'implemented-developer-release-client');
  }
});
