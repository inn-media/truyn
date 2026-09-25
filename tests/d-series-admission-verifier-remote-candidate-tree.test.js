import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const verifier = fs.readFileSync('scripts/verify-d-series-admission-run.sh', 'utf8');

test('admission verifier resolves frozen candidate tree without requiring local candidate object', () => {
  assert.match(verifier, /gh api "repos\/\$\{REPOSITORY\}\/commits\/\$\{SOURCE_SHA\}" --jq \.commit\.tree\.sha/);
  assert.ok(!verifier.includes('git rev-parse "${SOURCE_SHA}^{tree}"'));
  assert.match(verifier, /candidate_tree_invalid/);
  assert.match(verifier, /\.candidateTreeSha==\$candidate_tree/);
});
