import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const build = readFileSync('sdk/release/build-release.sh', 'utf8');
const verify = readFileSync('sdk/release/verify-release.mjs', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

test('ordinary CI cannot bypass the SDK archive scanner', () => {
  const contractStep = ci.indexOf('name: Verify SDK release scanner wiring');
  const packageStep = ci.indexOf('name: Build and verify SDK release packages');
  assert.notEqual(contractStep, -1, 'ordinary CI must execute the scanner wiring contract');
  assert.notEqual(packageStep, -1, 'ordinary CI must build and verify SDK release packages');
  assert.ok(contractStep < packageStep, 'scanner wiring contract must run before package build/verification');
  assert.match(ci, /run:\s*node --test tests\/sdk-release-ci-contract\.test\.js/);
  assert.match(ci, /run:\s*sdk\/release\/build-release\.sh/);

  assert.match(build, /node "\$ROOT\/sdk\/release\/verify-release\.mjs" "\$DIST"/,
    'package build must invoke release verifier');
  assert.match(verify, /safe-extract\.py/,
    'release verifier must bind the hardened extractor');
  assert.match(verify, /execFileSync\([\s\S]*safeExtractor[\s\S]*full[\s\S]*temporary/,
    'every package archive extraction must execute the hardened extractor');

  assert.equal(packageJson.scripts?.test, 'node --test tests/*.test.js',
    'ordinary test suite must retain all release security regression tests');
  assert.equal(existsSync('tests/sdk-release-archive-security.test.js'), true);
  assert.equal(existsSync('tests/sdk-release-archive-hardening.test.js'), true);
});
