import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mapper = fileURLToPath(new URL('../scripts/affected-tests.mjs', import.meta.url));

function suitesFor(...paths) {
  const call = spawnSync(process.execPath, [mapper, ...paths], {
    encoding: 'utf8',
    timeout: 10_000
  });
  assert.equal(call.status, 0, call.stderr || 'affected-test selector must exit cleanly');
  return new Set(JSON.parse(call.stdout).suites);
}

const g5Paths = [
  'network/relay/server.js',
  'network/relay/cosmos-lifecycle-ledger.js',
  'network/relay/durable-lifecycle-ledger.js',
  'runtime/service.js',
  'runtime/g5-relay-lifecycle-ledger.js',
  'runtime/g5-provider-effect-ledger.js',
  'tests/g5-cosmos-cross-process-sigkill.test.js',
  'tests/lifecycle-freeze-g5-replay.test.js',
  'sdk/conformance/G5_DURABLE_LIFECYCLE_BOUNDARY.md',
  'docs/compatibility/TRUYN1_G5_ASYNC_RELAY_CANDIDATE.md',
  'spec/protocol/v1/lifecycle.md',
  'spec/protocol/v1/offer.md',
  'spec/protocol/v1/need.md',
  'spec/protocol/v1/result.md',
  'spec/protocol/v1/partial.md',
  'spec/protocol/v1/revoke.md'
];

for (const path of g5Paths) {
  test(`G5 change ${path} cannot skip full qualification or five SDKs`, () => {
    const suites = suitesFor(path);
    assert.ok(suites.has('full'), `full qualification skipped for ${path}`);
    assert.ok(suites.has('sdk'), `five-SDK release/conformance skipped for ${path}`);
    assert.ok(suites.has('security'));
  });
}

test('unrelated documentation does not trigger costly full qualification', () => {
  const suites = suitesFor('docs/README.md');
  assert.equal(suites.has('full'), false);
  assert.equal(suites.has('sdk'), false);
});

test('a mixed change set containing a G5 lifecycle source cannot bypass full qualification', () => {
  const suites = suitesFor('docs/README.md', 'runtime/g5-provider-effect-ledger.js');
  assert.ok(suites.has('full') && suites.has('sdk'));
});
