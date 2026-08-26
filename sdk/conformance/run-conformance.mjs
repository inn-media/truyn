#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const args = new Set(process.argv.slice(2));
const languageArg = [...args].find((arg) => arg.startsWith('--language='));
const targetLanguage = languageArg ? languageArg.slice('--language='.length) : null;
const jsonOutput = args.has('--json');

function fail(message) {
  throw new Error(`DX-2 conformance runner: ${message}`);
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(repoRoot, path), 'utf8'));
}

async function fileExists(path) {
  await access(resolve(repoRoot, path));
}

async function readSources(paths) {
  const chunks = [];
  for (const path of paths) {
    await fileExists(path);
    chunks.push(await readFile(resolve(repoRoot, path), 'utf8'));
  }
  return chunks.join('\n');
}

const [manifest, schema, fixtures, descriptorFixtures] = await Promise.all([
  readJson('sdk/conformance/languages.json'),
  readJson('sdk/conformance/v1/sdk-contract.schema.json'),
  readJson('sdk/conformance/v1/golden-fixtures.json'),
  readJson('sdk/conformance/v1/agent-descriptor-runtime-fixtures.json')
]);

if (manifest.fixtureSet !== fixtures.fixtureSet) {
  fail(`manifest fixtureSet ${manifest.fixtureSet} does not match ${fixtures.fixtureSet}`);
}
if (manifest.protocol !== fixtures.protocol) {
  fail(`manifest protocol ${manifest.protocol} does not match ${fixtures.protocol}`);
}
if (descriptorFixtures.fixtureSet !== manifest.fixtureSet) {
  fail('Agent Descriptor runtime fixtures are not part of the same fixture set');
}

for (const dto of manifest.foundationalDtos) {
  if (!schema.$defs?.[dto]) fail(`schema is missing foundational DTO ${dto}`);
  const hasPositive = fixtures.dtoCases.some((entry) => entry.dto === dto && entry.polarity === 'positive');
  const hasNegative = fixtures.dtoCases.some((entry) => entry.dto === dto && entry.polarity === 'negative');
  if (!hasPositive || !hasNegative) fail(`fixtures do not cover both polarities for ${dto}`);
}

const languageIds = new Set(manifest.languages.map((language) => language.id));
for (const required of manifest.requiredFirstPartyLanguages) {
  if (!languageIds.has(required)) fail(`required first-party language missing from matrix: ${required}`);
}

const selected = targetLanguage
  ? manifest.languages.filter((language) => language.id === targetLanguage)
  : manifest.languages;

if (selected.length === 0) fail(`unknown language ${targetLanguage}`);

const results = [];
for (const language of selected) {
  await fileExists(language.root);
  const source = await readSources(language.sourceFiles);
  for (const marker of language.requiredMarkers) {
    if (!source.includes(marker)) {
      fail(`${language.id} is missing required marker: ${marker}`);
    }
  }
  if (language.publicDistribution !== false) {
    fail(`${language.id} must remain non-public until the stable package release gate`);
  }
  results.push({
    id: language.id,
    name: language.name,
    status: language.status,
    files: language.sourceFiles.length,
    markers: language.requiredMarkers.length
  });
}

const summary = {
  ok: true,
  fixtureSet: manifest.fixtureSet,
  protocol: manifest.protocol,
  languages: results
};

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} else {
  for (const language of results) {
    process.stdout.write(`PASS ${language.id} ${language.status}\n`);
  }
}
