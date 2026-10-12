import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateEvidencePaths } from '../scripts/check-documentation-consistency.mjs';

test('evidence file and directory symlinks cannot escape the repository', () => {
  const work = mkdtempSync(join(tmpdir(), 'truyn-proof-symlink-'));
  const root = join(work, 'repo'), external = join(work, 'external');
  try {
    mkdirSync(root); mkdirSync(external);
    writeFileSync(join(root, 'local.md'), '# Local proof\n');
    writeFileSync(join(external, 'proof.md'), '# Unversioned outside proof\n');
    symlinkSync(join(external, 'proof.md'), join(root, 'external-file.md'), 'file');
    symlinkSync(external, join(root, 'external-directory'), 'dir');
    symlinkSync(join(root, 'local.md'), join(root, 'internal-link.md'), 'file');
    assert.deepEqual(validateEvidencePaths(root, [{ label: 'valid', path: 'local.md' }]), []);
    assert.deepEqual(validateEvidencePaths(root, [{ label: 'internal', path: 'internal-link.md' }]), []);
    for (const path of ['external-file.md', 'external-directory/proof.md']) {
      assert.ok(validateEvidencePaths(root, [{ label: 'rejected', path }]).some(error => error.includes('resolves outside repository')), path);
    }
    symlinkSync(root, join(work, 'root-alias'), 'dir');
    assert.deepEqual(validateEvidencePaths(join(work, 'root-alias'), [{ label: 'root alias', path: 'local.md' }]), []);
    assert.ok(validateEvidencePaths(join(work, 'root-alias'), [{ label: 'root alias escape', path: 'external-file.md' }]).length > 0);
  } finally { rmSync(work, { recursive: true, force: true }); }
});
