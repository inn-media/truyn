import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'sdk/release/dist');
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
if (manifest.schema !== 'truyn.sdk-release/v1') throw new Error('unexpected release manifest schema');
if (!/^[0-9a-f]{40}$/i.test(manifest.sourceSha)) throw new Error('release source SHA must be exact');
if (manifest.release !== '0.1.0-alpha.1' || manifest.python !== '0.1.0a1') throw new Error('release version drift');

const required = {
  typescript: /\.tgz$/,
  python: /\.whl$/,
  go: /\.tar\.gz$/,
  java: /\.jar$/,
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

function entriesFor(path) {
  const full = resolve(root, path);
  if (path.endsWith('.tgz') || path.endsWith('.tar.gz')) return execFileSync('tar', ['-tzf', full], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  if (path.endsWith('.jar')) return execFileSync('jar', ['tf', full], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  if (path.endsWith('.whl') || path.endsWith('.nupkg')) return execFileSync('unzip', ['-Z1', full], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  return [];
}

const packageArtifacts = manifest.artifacts.filter((artifact) => /\.(tgz|tar\.gz|whl|jar|nupkg)$/.test(artifact.path));
for (const artifact of packageArtifacts) {
  const entries = entriesFor(artifact.path);
  const normalized = entries.map((entry) => entry.replace(/^\.\//, ''));
  if (!normalized.some((entry) => /(^|\/)LICENSE$/i.test(entry))) throw new Error(`LICENSE missing from ${artifact.path}`);
  if (!normalized.some((entry) => /(^|\/)NOTICE$/i.test(entry))) throw new Error(`NOTICE missing from ${artifact.path}`);
  const forbidden = normalized.find((entry) => /(^|\/)(\.git|\.github|node_modules|\.env)(\/|$)|private[_-]?key/i.test(entry));
  if (forbidden) throw new Error(`forbidden package entry ${forbidden} in ${artifact.path}`);
}

process.stdout.write(`PASS release package verification: ${manifest.artifacts.length} artifacts\n`);
