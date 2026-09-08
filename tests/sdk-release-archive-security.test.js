import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const python = process.env.PYTHON ?? 'python';
const extractor = resolve('sdk/release/safe-extract.py');

const generator = String.raw`
import io
import stat
import sys
import tarfile
import zipfile
from pathlib import Path

root = Path(sys.argv[1]).resolve()
attack = sys.argv[2]
tar_path = root / f"{attack}.tgz"
zip_path = root / f"{attack}.nupkg"
payload = b"owned"

if attack == "traversal":
    member_name = "../outside.txt"
elif attack == "absolute":
    member_name = (root / "absolute-outside.txt").as_posix()
elif attack == "symlink":
    member_name = None
else:
    raise SystemExit(f"unknown attack: {attack}")

with tarfile.open(tar_path, "w:gz") as tf:
    if attack == "symlink":
        link = tarfile.TarInfo("package/link")
        link.type = tarfile.SYMTYPE
        link.linkname = "../../outside-dir"
        tf.addfile(link)
        child = tarfile.TarInfo("package/link/escaped.txt")
        child.size = len(payload)
        tf.addfile(child, io.BytesIO(payload))
    else:
        member = tarfile.TarInfo(member_name)
        member.size = len(payload)
        tf.addfile(member, io.BytesIO(payload))

with zipfile.ZipFile(zip_path, "w") as zf:
    if attack == "symlink":
        link = zipfile.ZipInfo("package/link")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        zf.writestr(link, "../../outside-dir")
        zf.writestr("package/link/escaped.txt", payload)
    else:
        zf.writestr(member_name, payload)
`;

function generateFixtures(root, attack) {
  execFileSync(python, ['-c', generator, root, attack], { stdio: 'pipe' });
}

function assertDenied(archive, destination) {
  const result = spawnSync(python, [extractor, archive, destination], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, `malicious archive unexpectedly accepted: ${archive}`);
  assert.match(result.stderr, /^DENIED /m, `missing fail-closed DENIED marker for ${archive}`);
}

for (const attack of ['traversal', 'absolute', 'symlink']) {
  test(`SDK release safe extractor denies ${attack} in tar and zip families`, () => {
    const root = mkdtempSync(join(tmpdir(), `truyn-sdk-${attack}-`));
    try {
      generateFixtures(root, attack);
      assertDenied(join(root, `${attack}.tgz`), join(root, 'extract-tar'));
      assertDenied(join(root, `${attack}.nupkg`), join(root, 'extract-zip'));

      assert.equal(existsSync(join(root, 'outside.txt')), false);
      assert.equal(existsSync(join(root, 'absolute-outside.txt')), false);
      assert.equal(existsSync(join(root, 'outside-dir', 'escaped.txt')), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
