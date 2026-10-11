import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('P13 policy exists and cross-document stable deprecation minimum stays consistent', () => {
  const migration = read('spec/protocol/v1/migration.md');
  const sdk = read('docs/compatibility/SDK_COMPATIBILITY.md');
  const node = read('docs/compatibility/PROTOCOL_AND_NODE_COMPATIBILITY.md');
  const index = read('docs/compatibility/README.md');
  const protoIndex = read('spec/protocol/v1/README.md');
  for (const [name, content] of Object.entries({ migration, sdk, node, index, protoIndex })) {
    assert.match(content, /180 calendar days/i, `${name} must keep the shared numeric notice floor`);
  }
  assert.match(migration, /public.*deprecation notice/i);
  assert.match(migration, /Pre-v1 alpha\/beta.*do \*\*not\*\* inherit/i);
  assert.match(migration, /new protocol generation|new generation\/profile/i);
  assert.match(sdk, /next minor release/i);
  assert.match(sdk, /major release/i);
  assert.match(sdk, /Pre-v1 alpha APIs may move faster/);
});

test('P13 ledger recognizes published policy without claiming stable-v1 admission', () => {
  const ledger = read('docs/compatibility/TRUYN1_RC_GAP_LEDGER.md');
  const p13 = ledger.split('\n').find(line => line.startsWith('| P13 |'));
  assert.ok(p13, 'P13 row must exist');
  assert.match(p13, /policy is published/i);
  assert.match(p13, /Documentation subgate: DEFINED/);
  assert.match(p13, /qualification remains outstanding|release gate only after/i);
  assert.doesNotMatch(p13, /not yet stable-v1 release policy/i);
  assert.match(ledger, /P13 overall remains release-qualification pending/);
  assert.match(ledger, /TRUYN\/1.*remains draft/);
  assert.match(read('spec/protocol/v1/migration.md'), /does not itself declare `TRUYN\/1` stable/);
});
