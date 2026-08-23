import test from 'node:test';
import assert from 'node:assert/strict';

import { hasAuthorSignOff, parseSignOffs } from '../scripts/check-dco.mjs';

test('parseSignOffs extracts standard DCO trailers', () => {
  assert.deepEqual(
    parseSignOffs('feat: example\n\nSigned-off-by: Example Contributor <dev@example.com>\n'),
    [{ name: 'Example Contributor', email: 'dev@example.com' }]
  );
});

test('hasAuthorSignOff accepts an author-matching email case-insensitively', () => {
  const message = 'docs: update\n\nSigned-off-by: Example Contributor <DEV@EXAMPLE.COM>\n';
  assert.equal(hasAuthorSignOff(message, 'dev@example.com'), true);
});

test('hasAuthorSignOff rejects a missing sign-off', () => {
  assert.equal(hasAuthorSignOff('fix: unsigned commit', 'dev@example.com'), false);
});

test('hasAuthorSignOff rejects a sign-off from a different email', () => {
  const message = 'fix: mismatch\n\nSigned-off-by: Other Person <other@example.com>\n';
  assert.equal(hasAuthorSignOff(message, 'dev@example.com'), false);
});

test('parseSignOffs supports multiple sign-offs without weakening author matching', () => {
  const message = [
    'feat: collaborative work',
    '',
    'Signed-off-by: Reviewer <reviewer@example.com>',
    'Signed-off-by: Author <author@example.com>',
    ''
  ].join('\n');

  assert.equal(parseSignOffs(message).length, 2);
  assert.equal(hasAuthorSignOff(message, 'author@example.com'), true);
  assert.equal(hasAuthorSignOff(message, 'missing@example.com'), false);
});
