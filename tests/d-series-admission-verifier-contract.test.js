import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const admission = fs.readFileSync('scripts/verify-d-series-admission-run.sh', 'utf8');

test('admission verifier is independent of frozen candidate objects in shallow controller checkout', () => {
  assert.match(admission, /candidate_commit=.*gh api .*commits\/\$\{SOURCE_SHA\}/);
  assert.match(admission, /candidate_tree=.*\.commit\.tree\.sha/);
  assert.ok(!admission.includes('git rev-parse "${SOURCE_SHA}^{tree}"'));
});

test('admission verifier binds launch authority to admitted main identity, not integration tree equality with main', () => {
  for (const marker of [
    'currentMainSha',
    'currentMainTreeSha',
    'allowed_main_shas',
    'allowed_main_trees',
    'main_binding_ok',
    'run_head_sha',
    '.integrationTreeSha==$integration_tree',
    '.requalification.integrationTreeSha==$integration_tree',
    '.value.sourceSha==$integration_tree'
  ]) assert.ok(admission.includes(marker), marker);
  assert.ok(!admission.includes('allowed_trees'));
  assert.match(admission, /changed_status.*added/);
  assert.ok(admission.includes('^\\.github/d[0-9]+/launch-[0-9]+\\.txt$'));
});
