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

# Oversized first member: no member payload is present. A safe scanner must deny
# from the first 512-byte header rather than asking tarfile to consume payload.
write_raw_tgz(
    root / 'incremental-member-size.tgz',
    [header('package/oversized.bin', MAX_MEMBER_BYTES + 1)],
)

# 4,097 zero-length members: scanner must stop at the first header beyond the
# bound instead of first materializing every TarInfo object.
write_raw_tgz(
    root / 'incremental-member-count.tgz',
    [header(f'package/member-{index:05d}.txt') for index in range(MAX_MEMBERS + 1)],
)

# Directory payloads are nonsensical for release packages and must not be
# exempted from limits/scanning.
write_raw_tgz(
    root / 'nonempty-directory.tgz',
    [header('package/', 1, tarfile.DIRTYPE)],
)

# PAX payload is intentionally absent. The physical extension-header size must
# be rejected before tarfile parses/decompresses it.
write_raw_tgz(
    root / 'oversized-pax.tgz',
    [header('././@PaxHeader', MAX_EXTENSION_BYTES + 1, tarfile.XHDTYPE)],
)

# BZIP2 is a valid ZIP method but is deliberately outside the scanner's bounded
# codec profile; rejecting it prevents forged declared-size decompression bypass.
with zipfile.ZipFile(root / 'unsupported-codec.nupkg', 'w', compression=zipfile.ZIP_BZIP2) as archive:
    archive.writestr('package/file.txt', b'bounded-fixture')
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

test('P1: tar member-size limit is enforced from the raw header before payload materialization', () => {
  withFixtures((root) => {
    assert.match(deny(root, 'incremental-member-size.tgz'), /archive member uncompressed size limit exceeded/i);
  });
});

test('P1: tar member-count limit is enforced incrementally before getmembers materialization', () => {
  withFixtures((root) => {
    assert.match(deny(root, 'incremental-member-count.tgz'), /archive member count limit exceeded/i);
  });
});

test('P1: non-empty tar directory entries are rejected', () => {
  withFixtures((root) => {
    assert.match(deny(root, 'nonempty-directory.tgz'), /non-empty tar directory entry/i);
  });
});

test('P1: tar extension-header payload is bounded before tarfile parsing', () => {
  withFixtures((root) => {
    assert.match(deny(root, 'oversized-pax.tgz'), /tar extension header size limit exceeded/i);
  });
});

test('P1: ZIP codecs outside stored/deflate are rejected before member decompression', () => {
  withFixtures((root) => {
    assert.match(deny(root, 'unsupported-codec.nupkg'), /unsupported ZIP compression method/i);
  });
});
