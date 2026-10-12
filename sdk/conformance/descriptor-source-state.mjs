import { execFileSync } from 'node:child_process';

// Actual repository input roots of the native commands in the parity runner.
// In particular, Go's ./... still visits ignored bin/, build/ and target/ packages.
const inputRoots = Object.freeze([
  'core', 'sdk/conformance', 'sdk/go', 'sdk/java/src', 'sdk/dotnet',
  'sdk/python/src', 'sdk/python/tests', 'sdk/typescript/src', 'sdk/typescript/test'
]);
function generatedOutput(path) {
  // Only these two .NET project output roots are excluded by their SDK Compile
  // item globs. Do not generalize a bin/ or obj/ exception to Go or other trees.
  if (/^sdk\/dotnet\/(?:conformance\/)?(?:bin|obj)\//.test(path)) return true;
  // CPython bytecode is generated output, not a .py source exemption: a source
  // hidden under __pycache__/ must still be reported, as must any unknown input.
  if (/^sdk\/python\/(?:src|tests)\/(?:.*\/)?__pycache__\/[^/]+\.pyc$/.test(path)) return true;
  if (/^sdk\/python\/src\/[^/]+\.egg-info\/(?:PKG-INFO|SOURCES\.txt|dependency_links\.txt|top_level\.txt|requires\.txt|entry_points\.txt)$/.test(path)) return true;
  return false;
}
export function inspectSourceState(cwd) {
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8' });
  const unexpectedIgnoredInputs = git(['ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', ...inputRoots])
    .split('\0').filter(Boolean).filter(path => !generatedOutput(path)).sort();
  return {
    sourceSha: git(['rev-parse', 'HEAD']).trim(),
    clean: git(['status', '--porcelain', '--untracked-files=all']).trim() === '' && unexpectedIgnoredInputs.length === 0,
    unexpectedIgnoredInputs
  };
}
export function sourceStateQualified(before, after) {
  return before.clean === true && after.clean === true && before.sourceSha === after.sourceSha;
}
