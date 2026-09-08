import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve(process.argv[2] ?? 'sdk/release/dist');
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
if (manifest.schema !== 'truyn.sdk-release/v1') throw new Error('unexpected release manifest schema');
if (!/^[0-9a-f]{40}$/i.test(manifest.sourceSha)) throw new Error('release source SHA must be exact');
if (manifest.release !== '0.1.0-alpha.1' || manifest.typescript !== '0.1.0-alpha.2' || manifest.python !== '0.1.0a1') {
  throw new Error('release version drift');
}

const required = {
  typescript: /\/truyn-sdk-0\.1\.0-alpha\.2\.tgz$/,
  python: /\.whl$/,
  go: /\.tar\.gz$/,
  java: /\/truyn-sdk-0\.1\.0-alpha\.1\.jar$/,
  dotnet: /\.nupkg$/
};
for (const [language, pattern] of Object.entries(required)) {
  if (!manifest.artifacts.some((artifact) => artifact.path.startsWith(`${language}/`) && pattern.test(artifact.path))) {
    throw new Error(`missing ${language} release artifact`);
  }
}
for (const artifact of manifest.artifacts) {
  if (!/^[0-9a-f]{64}$/.test(artifact.sha256) || artifact.bytes <= 0) throw new Error(`invalid artifact digest: ${artifact.path}`);
}

function canonicalArchiveFormat(path) {
  if (path.startsWith('typescript/') && path.endsWith('.tgz')) return 'npm-tgz';
  if (path.startsWith('python/') && path.endsWith('.whl')) return 'python-wheel';
  if (path.startsWith('go/') && path.endsWith('.tar.gz')) return 'go-tar-gz';
  if (path.startsWith('java/') && path.endsWith('.jar')) return 'java-jar';
  if (path.startsWith('dotnet/') && path.endsWith('.nupkg')) return 'dotnet-nupkg';
  return null;
}

async function listExtractedEntries(directory, base = directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    const rel = relative(base, full).split(sep).join('/');
    result.push(entry.isDirectory() ? `${rel}/` : rel);
    if (entry.isDirectory()) result.push(...await listExtractedEntries(full, base));
  }
  return result;
}

async function extractEntriesFor(path) {
  const full = resolve(root, path);
  const rootPrefix = `${root}${sep}`;
  if (full !== root && !full.startsWith(rootPrefix)) throw new Error(`release artifact escapes dist root: ${path}`);

  const temporary = await mkdtemp(join(tmpdir(), 'truyn-sdk-archive-'));
  try {
    const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
    if (path.endsWith('.tgz') || path.endsWith('.tar.gz')) {
      execFileSync('tar', ['-xzf', full, '-C', temporary, '--no-same-owner', '--no-same-permissions'], options);
    } else if (path.endsWith('.jar')) {
      execFileSync('jar', ['xf', full], { ...options, cwd: temporary });
    } else if (path.endsWith('.whl') || path.endsWith('.nupkg')) {
      execFileSync('unzip', ['-qq', full, '-d', temporary], options);
    } else {
      throw new Error(`unsupported package archive format: ${path}`);
    }
    return await listExtractedEntries(temporary);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const packageArtifacts = manifest.artifacts.filter((artifact) => /\.(tgz|tar\.gz|whl|jar|nupkg)$/.test(artifact.path));
const readFormats = new Set();
for (const artifact of packageArtifacts) {
  const entries = await extractEntriesFor(artifact.path);
  const format = canonicalArchiveFormat(artifact.path);
  if (format) readFormats.add(format);

  const normalized = entries.map((entry) => entry.replace(/^\.\//, ''));
  const isMavenCompanion = /java\/truyn-sdk-0\.1\.0-alpha\.1-(sources|javadoc)\.jar$/.test(artifact.path);
  if (!isMavenCompanion) {
    if (!normalized.some((entry) => /(^|\/)LICENSE$/i.test(entry))) throw new Error(`LICENSE missing from ${artifact.path}`);
    if (!normalized.some((entry) => /(^|\/)NOTICE$/i.test(entry))) throw new Error(`NOTICE missing from ${artifact.path}`);
  }
  const forbidden = normalized.find((entry) => /(^|\/)(\.git|\.github|node_modules|\.env)(\/|$)|private[_-]?key/i.test(entry));
  if (forbidden) throw new Error(`forbidden package entry ${forbidden} in ${artifact.path}`);
}

for (const expectedFormat of ['npm-tgz', 'python-wheel', 'go-tar-gz', 'java-jar', 'dotnet-nupkg']) {
  if (!readFormats.has(expectedFormat)) throw new Error(`package archive format was not extracted/read: ${expectedFormat}`);
}

const javaPaths = new Set(manifest.artifacts.filter((artifact) => artifact.path.startsWith('java/')).map((artifact) => artifact.path));
for (const expected of [
  'java/truyn-sdk-0.1.0-alpha.1.jar',
  'java/truyn-sdk-0.1.0-alpha.1-sources.jar',
  'java/truyn-sdk-0.1.0-alpha.1-javadoc.jar',
  'java/truyn-sdk-0.1.0-alpha.1.pom'
]) {
  if (!javaPaths.has(expected)) throw new Error(`missing Maven publication companion: ${expected}`);
}

process.stdout.write(`PASS release package verification: ${manifest.artifacts.length} artifacts; extracted formats=${[...readFormats].sort().join(',')}\n`);
