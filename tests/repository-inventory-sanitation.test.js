import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('entire tracked repository has inventory coverage without destructive cleanup', () => {
  const stdout = execFileSync(process.execPath, ['scripts/audit-repository-inventory.mjs'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const line = stdout.split('\n').find(x => x.startsWith('REPOSITORY_INVENTORY='));
  assert.ok(line, 'inventory must be emitted');
  const result = JSON.parse(line.slice('REPOSITORY_INVENTORY='.length));
  assert.equal(result.schema, 'truyn.repository.inventory/v1');
  assert.ok(result.trackedFiles > 1000, 'expected complete public repository inventory');
  for (const dir of ['docs','sdk','tests','core','network','scripts','spec']) assert.ok(result.topLevelCounts[dir] > 0, `missing ${dir}`);
  assert.ok(Array.isArray(result.byteIdenticalPairs));
  assert.ok(Array.isArray(result.statusReviewCandidates));
});
