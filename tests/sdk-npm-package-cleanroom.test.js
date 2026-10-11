import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../sdk/typescript/package.json', import.meta.url), 'utf8'));
const version = JSON.parse(await readFile(new URL('../sdk/release/version.json', import.meta.url), 'utf8'));
const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('candidate npm SDK externalizes ws as an explicit runtime dependency', () => {
  assert.equal(pkg.version, version.typescript);
  assert.equal(pkg.dependencies?.ws, '8.21.1');
  assert.match(pkg.scripts.build, /--external ws(?:\s|$)/);
  assert.match(version.typescript, /^0\.1\.0-alpha\.[0-9]+$/);
  assert.match(version.python, /^0\.1\.0a[0-9]+$/);
  assert.match(version.goTag, /^sdk\/go\/v0\.1\.0-alpha\.[0-9]+$/);
});

test('ordinary CI clean-room installs and imports the packed TypeScript artifact', () => {
  assert.match(ci, /name: Clean-room import packed TypeScript SDK/);
  assert.match(ci, /truyn-sdk-\$\{version\}\.tgz/);
  assert.match(ci, /npm install --ignore-scripts --no-audit --no-fund "\$package"/);
  assert.match(ci, /import\('@truyn\/sdk'\)/);
});
