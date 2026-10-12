import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';

/** Build Java/.NET from immutable Git blobs in a new directory, never cached checkout binaries. */
export function stageDescriptorNativeSource(root, sourceSha, parentDirectory) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error('exact native source commit required');
  const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
  const entries = git(['ls-tree', '-r', '-z', '--full-tree', sourceSha, '--',
    'sdk/java', 'sdk/dotnet', 'sdk/LICENSE', 'sdk/NOTICE',
    'Directory.Build.props', 'Directory.Build.targets', 'Directory.Packages.props', 'NuGet.Config', 'nuget.config', 'global.json',
    'sdk/Directory.Build.props', 'sdk/Directory.Build.targets', 'sdk/Directory.Packages.props', 'sdk/NuGet.Config', 'sdk/nuget.config', 'sdk/global.json'
  ]).toString('utf8').split('\0').filter(Boolean).map(entry => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
    if (!match) throw new Error('native source must contain only regular tracked files');
    const [, mode, blobSha, path] = match;
    if (isAbsolute(path) || path.split(/[\\/]/).includes('..')) throw new Error('invalid native source path');
    if (/^sdk\/java\/target\//.test(path) || /^sdk\/dotnet\/(?:conformance\/)?(?:bin|obj)\//.test(path)) {
      throw new Error('tracked native build output cannot qualify as source');
    }
    return { mode, blobSha, path };
  });
  for (const required of ['sdk/java/pom.xml', 'sdk/dotnet/Truyn.Sdk.csproj', 'sdk/dotnet/conformance/Truyn.Sdk.Conformance.csproj']) {
    if (!entries.some(item => item.path === required)) throw new Error(`missing native build input: ${required}`);
  }
  const directory = mkdtempSync(join(parentDirectory, 'native-source-'));
  for (const { mode, blobSha, path } of entries) {
    const destination = join(directory, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, git(['cat-file', 'blob', blobSha]), { flag: 'wx', mode: mode === '100755' ? 0o700 : 0o600 });
  }
  return { directory, sourceSha, sourceBlobs: Object.fromEntries(entries.map(item => [item.path, item.blobSha])) };
}
