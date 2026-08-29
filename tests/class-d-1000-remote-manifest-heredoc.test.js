import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Class D remote jq variables survive the outer heredocs', async () => {
  const provision = await readFile('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');
  const finalAcceptance = await readFile('scripts/class-d-1000-final-acceptance.sh', 'utf8');

  assert.match(provision, /sourceSha == \\\$sha/);
  assert.match(finalAcceptance, /sourceSha == \\\$sha/);
  assert.doesNotMatch(provision, /sourceSha == \$sha'/);
  assert.match(provision, /seed:\\\$seed/);
  assert.doesNotMatch(provision, /seed:\$seed/);
});
