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

const [manifest, schema, fixtures, descriptorFixtures, publicCoordinates] = await Promise.all([
  readJson('sdk/conformance/languages.json'),
  readJson('sdk/conformance/v1/sdk-contract.schema.json'),
  readJson('sdk/conformance/v1/golden-fixtures.json'),
  readJson('sdk/conformance/v1/agent-descriptor-runtime-fixtures.json'),
  readJson('sdk/release/public-coordinates.json')
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

const coordinateToLanguage = new Map([
  ['npm', 'typescript'],
  ['pypi', 'python'],
  ['go', 'go'],
  ['maven', 'java'],
  ['nuget', 'dotnet']
]);
const ledgerAcceptedLanguages = new Set();
for (const [coordinateId, languageId] of coordinateToLanguage) {
  const coordinate = publicCoordinates.coordinates?.[coordinateId];
  if (!coordinate) fail(`public coordinate ledger is missing ${coordinateId}`);
  if (coordinate.publicationState === 'accepted') {
    ledgerAcceptedLanguages.add(languageId);
  } else if (coordinate.publicationState !== 'open') {
    fail(`${coordinateId} has unsupported publicationState ${coordinate.publicationState}`);
  }
}

const acceptedPublicDistributionLanguages = new Set(manifest.acceptedPublicDistributionLanguages || []);
for (const languageId of ledgerAcceptedLanguages) {
  if (!acceptedPublicDistributionLanguages.has(languageId)) {
    fail(`${languageId} is accepted in public-coordinates.json but missing from acceptedPublicDistributionLanguages`);
  }
}
for (const languageId of acceptedPublicDistributionLanguages) {
  if (!ledgerAcceptedLanguages.has(languageId)) {
    fail(`${languageId} is marked accepted in languages.json but not accepted in public-coordinates.json`);
  }
}

for (const language of manifest.languages) {
  const expectedPublic = acceptedPublicDistributionLanguages.has(language.id);
  if (language.publicDistribution !== expectedPublic) {
    fail(`${language.id} publicDistribution must match acceptedPublicDistributionLanguages`);
  }
  if (expectedPublic && language.publicDistributionChannel !== 'pre-release') {
    fail(`${language.id} accepted public alpha must declare publicDistributionChannel=pre-release`);
  }
  if (!expectedPublic && language.publicDistributionChannel !== undefined) {
    fail(`${language.id} must not declare a public distribution channel before registry acceptance`);
  }
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
  results.push({
    id: language.id,
    name: language.name,
    status: language.status,
    publicDistribution: language.publicDistribution,
    publicDistributionChannel: language.publicDistributionChannel ?? null,
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
