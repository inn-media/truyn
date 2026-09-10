import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, '../..');
const version = '0.1.0-alpha.1';
const target = resolve(root, 'sdk/java/target');
const output = resolve(process.argv[2] ?? resolve(target, 'maven-release-manifest.json'));
const sourceSha = process.env.TRUYN_RELEASE_SOURCE_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const releaseTag = process.env.TRUYN_MAVEN_RELEASE_TAG || null;
const signingFingerprint = process.env.TRUYN_MAVEN_SIGNING_FINGERPRINT || null;

const files = [
  resolve(target, `truyn-sdk-${version}.jar`),
  resolve(target, `truyn-sdk-${version}-sources.jar`),
  resolve(target, `truyn-sdk-${version}-javadoc.jar`),
  resolve(root, 'sdk/java/pom.xml'),
  resolve(target, 'central-publishing', `truyn-sdk-${version}-central-bundle.zip`)
];

const artifacts = [];
for (const path of files) {
  const info = await stat(path);
  if (!info.isFile() || info.size <= 0) throw new Error(`missing Maven release artifact: ${path}`);
  const bytes = await readFile(path);
  artifacts.push({
    path: path.replace(`${root}/`, ''),
    bytes: info.size,
    sha256: createHash('sha256').update(bytes).digest('hex')
  });
}

const manifest = {
  schema: 'truyn.maven-release/v1',
  coordinate: `org.truyn:truyn-sdk:${version}`,
  sourceSha,
  releaseTag,
  signingFingerprint,
  createdAt: new Date().toISOString(),
  artifacts
};

await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
