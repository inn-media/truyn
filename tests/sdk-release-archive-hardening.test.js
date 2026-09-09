import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const python = process.env.PYTHON ?? 'python';
const extractor = resolve('sdk/release/safe-extract.py');

const generator = String.raw`
import gzip
import sys
import tarfile
import zipfile
from pathlib import Path

root = Path(sys.argv[1]).resolve()
MAX_MEMBERS = 4096
MAX_MEMBER_BYTES = 32 * 1024 * 1024
MAX_EXTENSION_BYTES = 1024 * 1024

def header(name, size=0, typeflag=tarfile.REGTYPE):
    info = tarfile.TarInfo(name)
    info.size = size
    info.type = typeflag
    return info.tobuf(format=tarfile.USTAR_FORMAT)

def write_raw_tgz(path, headers):
    with gzip.open(path, 'wb') as stream:
        for raw in headers:
            stream.write(raw)
        stream.write(b'\\0' * 1024)

write_raw_tgz(root / 'incremental-member-size.tgz',
              [header('package/oversized.bin', MAX_MEMBER_BYTES + 1)])
write_raw_tgz(root / 'incremental-member-count.tgz',
              [header(f'package/member-{index:05d}.txt') for index in range(MAX_MEMBERS + 1)])
write_raw_tgz(root / 'nonempty-directory.tgz',
              [header('package/', 1, tarfile.DIRTYPE)])
write_raw_tgz(root / 'oversized-pax.tgz',
              [header('././@PaxHeader', MAX_EXTENSION_BYTES + 1, tarfile.XHDTYPE)])
write_raw_tgz(root / 'oversized-gnu-longname.tgz',
              [header('././@LongLink', MAX_EXTENSION_BYTES + 1, b'L')])
write_raw_tgz(root / 'oversized-gnu-longlink.tgz',
              [header('././@LongLink', MAX_EXTENSION_BYTES + 1, b'K')])

with zipfile.ZipFile(root / 'unsupported-bzip2.nupkg', 'w', compression=zipfile.ZIP_BZIP2) as archive:
    archive.writestr('package/file.txt', b'bounded-fixture')
with zipfile.ZipFile(root / 'unsupported-lzma.nupkg', 'w', compression=zipfile.ZIP_LZMA) as archive:
    archive.writestr('package/file.txt', b'bounded-fixture')
with zipfile.ZipFile(root / 'nonempty-directory.nupkg', 'w') as archive:
    info = zipfile.ZipInfo('package/')
    info.external_attr = 0o40775 << 16
    archive.writestr(info, b'x')
`;

function deny(root, archiveName) {
  const result = spawnSync(python, [extractor, join(root, archiveName), join(root, `${archiveName}.out`)], {
    encoding: 'utf8'
  });
  assert.notEqual(result.status, 0, `${archiveName} unexpectedly accepted`);
  assert.match(result.stderr, /^DENIED /m, `${archiveName} did not fail closed`);
  return result.stderr;
}

function withFixtures(callback) {
  const root = mkdtempSync(join(tmpdir(), 'truyn-sdk-hardening-'));
  try {
    execFileSync(python, ['-c', generator, root], { stdio: 'pipe' });
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const cases = [
  ['incremental-member-size.tgz', /archive member uncompressed size limit exceeded/i],
  ['incremental-member-count.tgz', /archive member count limit exceeded/i],
  ['nonempty-directory.tgz', /non-empty tar directory entry/i],
  ['oversized-pax.tgz', /tar extension header size limit exceeded/i],
  ['oversized-gnu-longname.tgz', /tar extension header size limit exceeded/i],
  ['oversized-gnu-longlink.tgz', /tar extension header size limit exceeded/i],
  ['unsupported-bzip2.nupkg', /unsupported ZIP compression method/i],
  ['unsupported-lzma.nupkg', /unsupported ZIP compression method/i],
  ['nonempty-directory.nupkg', /non-empty ZIP directory entry/i],
];

for (const [archiveName, expected] of cases) {
  test(`P1: ${archiveName} fails closed`, () => {
    withFixtures((root) => assert.match(deny(root, archiveName), expected));
  });
}
