import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../sdk/typescript/package.json', import.meta.url), 'utf8'));
const version = JSON.parse(await readFile(new URL('../sdk/release/version.json', import.meta.url), 'utf8'));
const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('npm alpha.2 externalizes ws as an explicit runtime dependency', () => {
  assert.equal(pkg.version, '0.1.0-alpha.2');
  assert.equal(pkg.dependencies?.ws, '8.21.1');
  assert.match(pkg.scripts.build, /--external ws(?:\s|$)/);
  assert.equal(version.typescript, '0.1.0-alpha.2');
  assert.equal(version.python, '0.1.0a1');
  assert.equal(version.goTag, 'sdk/go/v0.1.0-alpha.1');
});

test('ordinary CI clean-room installs and imports the packed TypeScript artifact', () => {
  assert.match(ci, /name: Clean-room import packed TypeScript SDK/);
  assert.match(ci, /truyn-sdk-0\.1\.0-alpha\.2\.tgz/);
  assert.match(ci, /npm install --ignore-scripts --no-audit --no-fund "\$package"/);
  assert.match(ci, /import\('@truyn\/sdk'\)/);
});
