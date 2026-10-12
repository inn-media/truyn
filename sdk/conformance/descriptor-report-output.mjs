import { realpathSync, writeFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname, basename, join } from 'node:path';

function contained(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !/^\.\.[\\/]/.test(rel));
}

/** Report output is evidence, never a repository/source write. No overwrites. */
export function writeDescriptorParityReport(repositoryRoot, destination, report) {
  if (typeof destination !== 'string' || destination.length === 0) throw new Error('Descriptor report path required');
  const lexicalRoot = resolve(repositoryRoot), realRoot = realpathSync(lexicalRoot);
  const lexicalPath = resolve(destination);
  const actualPath = join(realpathSync(dirname(lexicalPath)), basename(lexicalPath));
  if (contained(lexicalRoot, lexicalPath) || contained(realRoot, actualPath)) {
    throw new Error('Descriptor report must be outside the repository');
  }
  // Exclusive creation refuses existing files, symlinks and hard-link aliases,
  // so an external path cannot overwrite tracked source through indirection.
  writeFileSync(actualPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return actualPath;
}
