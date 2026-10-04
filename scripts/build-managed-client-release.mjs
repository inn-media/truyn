import { mkdir, rm, writeFile, cp, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';

const version = process.env.TRUYN_CLIENT_RELEASE_VERSION || '0.1.0-p20s02.1';
const sourceSha = process.env.GITHUB_SHA || 'local';
const platforms = ['windows-x64', 'macos-x64', 'linux-x64', 'android-universal'];
const out = 'dist/managed-client-release';
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const contractFiles = [
  'sdk/js/client/managed-auth-device-contract.js',
  'sdk/js/client/managed-sync-config-contract.js'
];

for (const platform of platforms) {
  const dir = join(out, `truyn-managed-client-${version}-${platform}`);
  await mkdir(dir, { recursive: true });
  for (const file of contractFiles) await cp(file, join(dir, basename(file)));
  await writeFile(join(dir, 'RELEASE.json'), JSON.stringify({
    schema: 'truyn.managed-client-release/v1', version, platform, sourceSha,
    contracts: ['truyn.managed-auth-device/v1', 'truyn.managed-sync-config/v1'],
    flows: ['login-device', 'settings-sync', 'logout-revocation']
  }, null, 2) + '\n');
}

const manifest = { schema: 'truyn.managed-client-release-manifest/v1', version, sourceSha, artifacts: [] };
for (const platform of platforms) {
  const name = `truyn-managed-client-${version}-${platform}`;
  const release = await readFile(join(out, name, 'RELEASE.json'));
  manifest.artifacts.push({ platform, directory: name, releaseSha256: createHash('sha256').update(release).digest('hex') });
}
await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
