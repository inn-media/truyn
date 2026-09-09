import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTestedSourceCommit } from '../scripts/validate-d200-tested-source-dco.mjs';

const author = { name: 'Dev Example', email: 'dev@example.com' };
const signed = 'fix: source\n\nSigned-off-by: Dev Example <dev@example.com>';

function commit(overrides = {}) {
  return {
    sha: 'merge',
    commit: {
      message: 'Merge pull request #559 from inn-media/repair',
      author,
      verification: { verified: true }
    },
    committer: { login: 'web-flow' },
    parents: [{ sha: 'base' }, { sha: 'head' }],
    ...overrides
  };
}

function head(message = signed, email = author.email) {
  return {
    sha: 'head',
    commit: {
      message,
      author: { name: 'Dev Example', email }
    }
  };
}

test('accepts direct source only with author-matching sign-off', () => {
  const direct = commit({
    commit: { message: signed, author, verification: { verified: false } },
    committer: { login: 'developer' },
    parents: [{ sha: 'base' }]
  });
  assert.equal(validateTestedSourceCommit(direct).mode, 'direct-author-signed-off');
});

test('accepts verified canonical GitHub merge with signed exact second parent', () => {
  const result = validateTestedSourceCommit(commit(), head());
  assert.equal(result.mode, 'verified-github-merge-with-author-signed-head');
  assert.equal(result.mergedHeadSha, 'head');
});

test('rejects unsigned non-merge', () => {
  assert.throws(
    () => validateTestedSourceCommit(commit({
      commit: { message: 'fix: unsigned', author, verification: { verified: true } },
      parents: [{ sha: 'base' }]
    })),
    /two-parent GitHub merge/
  );
});

test('rejects unverified, non-web-flow, or noncanonical merge', () => {
  assert.throws(
    () => validateTestedSourceCommit(commit({ commit: { message: 'Merge pull request #559 from inn-media/repair', author, verification: { verified: false } } }), head()),
    /cryptographically verified/
  );
  assert.throws(
    () => validateTestedSourceCommit(commit({ committer: { login: 'developer' } }), head()),
    /web-flow/
  );
  assert.throws(
    () => validateTestedSourceCommit(commit({ commit: { message: 'merge repair', author, verification: { verified: true } } }), head()),
    /canonical GitHub merge message/
  );
});

test('rejects mismatched second parent or missing author-matching DCO', () => {
  assert.throws(
    () => validateTestedSourceCommit(commit(), { ...head(), sha: 'other' }),
    /second parent/
  );
  assert.throws(
    () => validateTestedSourceCommit(commit(), head('fix: unsigned')),
    /author-matching Signed-off-by/
  );
  assert.throws(
    () => validateTestedSourceCommit(commit(), head('fix: wrong signer\n\nSigned-off-by: Someone Else <other@example.com>')),
    /author-matching Signed-off-by/
  );
});
