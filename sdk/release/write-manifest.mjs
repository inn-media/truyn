import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'sdk/release/dist');
const sourceSha = process.env.TRUYN_RELEASE_SOURCE_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const version = JSON.parse(await readFile(new URL('./version.json', import.meta.url), 'utf8'));

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else if (entry.isFile() && entry.name !== 'manifest.json') out.push(path);
  }
  return out;
}

const artifacts = [];
for (const path of (await walk(root)).sort()) {
  const bytes = await readFile(path);
  const info = await stat(path);
  artifacts.push({
    path: relative(root, path).replaceAll('\\\\', '/'),
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex')
  });
}

const manifest = {
  schema: 'truyn.sdk-release/v1',
  sourceSha,
  createdAt: new Date().toISOString(),
  ...version,
  artifacts
};
await writeFile(resolve(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
