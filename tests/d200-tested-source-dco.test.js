import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTestedSourceCommit } from '../scripts/validate-d200-tested-source-dco.mjs';

const author = { name: 'Dev Example', email: 'dev@example.com' };
const signed = 'fix: source\n\nSigned-off-by: Dev Example <dev@example.com>';
const mergeCommit = (overrides = {}) => ({ sha: 'merge', commit: { author, message: 'Merge pull request #559 from inn-media/repair', verification: { verified: true } }, committer: { login: 'web-flow' }, parents: [{ sha: 'base' }, { sha: 'head' }], ...overrides });
const mergedHead = (message = signed, email = author.email) => ({ sha: 'head', commit: { author: { ...author, email }, message } });

test('direct source requires author-matching sign-off', () => {
  const direct = { commit: { author, message: signed }, committer: { login: 'developer' }, parents: [{ sha: 'base' }] };
  assert.equal(validateTestedSourceCommit(direct).mode, 'direct-author-signed-off');
  assert.throws(() => validateTestedSourceCommit({ ...direct, commit: { ...direct.commit, message: 'fix: source\n\nSigned-off-by: Other Dev <other@example.com>' } }), /two-parent GitHub merge/);
});

test('verified GitHub merge accepts exact author-signed second parent', () => assert.equal(validateTestedSourceCommit(mergeCommit(), mergedHead()).mode, 'verified-github-merge-with-author-signed-head'));
test('rejects unverified and non-GitHub merges', () => {
  assert.throws(() => validateTestedSourceCommit(mergeCommit({ commit: { author, message: 'Merge pull request #559 from inn-media/repair', verification: { verified: false } } }), mergedHead()), /cryptographically verified/);
  assert.throws(() => validateTestedSourceCommit(mergeCommit({ committer: { login: 'developer' } }), mergedHead()), /GitHub web-flow/);
});
test('rejects wrong second parent or non-author sign-off', () => {
  assert.throws(() => validateTestedSourceCommit(mergeCommit(), { ...mergedHead(), sha: 'other' }), /second parent/);
  assert.throws(() => validateTestedSourceCommit(mergeCommit(), mergedHead('fix: source\n\nSigned-off-by: Other Dev <other@example.com>')), /author-matching Signed-off-by/);
});
