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

const privateKeyGenerator = String.raw`
import io
import sys
import tarfile
import zipfile
from pathlib import Path

root = Path(sys.argv[1]).resolve()
tar_path = root / "private-key.tgz"
zip_path = root / "private-key.nupkg"
payload = b"config\n-----BEGIN PRIVATE KEY-----\nZmFrZQ==\n-----END PRIVATE KEY-----\n"
member_name = "package/config.txt"

with tarfile.open(tar_path, "w:gz") as tf:
    member = tarfile.TarInfo(member_name)
    member.size = len(payload)
    tf.addfile(member, io.BytesIO(payload))

with zipfile.ZipFile(zip_path, "w") as zf:
    zf.writestr(member_name, payload)
`;

const credentialGenerator = String.raw`
import io
import sys
import tarfile
import zipfile
from pathlib import Path

root = Path(sys.argv[1]).resolve()
kind = sys.argv[2]
tar_path = root / f"{kind}.tgz"
zip_path = root / f"{kind}.nupkg"
member_name = "package/settings.txt"

if kind == "token":
    payload = b"authorization=ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n"
elif kind == "credential":
    payload = b"client_secret=TruynFixtureCredentialValue1234567890\n"
else:
    raise SystemExit(f"unknown credential fixture: {kind}")

with tarfile.open(tar_path, "w:gz") as tf:
    member = tarfile.TarInfo(member_name)
    member.size = len(payload)
    tf.addfile(member, io.BytesIO(payload))

with zipfile.ZipFile(zip_path, "w") as zf:
    zf.writestr(member_name, payload)
`;

const privateCloudGenerator = String.raw`
import io
import sys
import tarfile
import zipfile
from pathlib import Path

root = Path(sys.argv[1]).resolve()
kind = sys.argv[2]
tar_path = root / f"private-cloud-{kind}.tgz"
zip_path = root / f"private-cloud-{kind}.nupkg"
member_name = "package/topology.txt"

if kind == "azure":
    payload = (
        b"AZURE_SUBSCRIPTION_ID=11111111-2222-3333-4444-555555555555\n"
        b"resource=/subscriptions/11111111-2222-3333-4444-555555555555/resourceGroups/truyn-prod/providers/Microsoft.DocumentDB/databaseAccounts/truyn-prod-cosmos\n"
        b"endpoint=https://truynprodvault.vault.azure.net\n"
    )
elif kind == "gcp":
    payload = (
        b"GCP_PROJECT_NUMBER=123456789012\n"
        b"wif=projects/123456789012/locations/global/workloadIdentityPools/truyn-prod-pool/providers/github\n"
        b"runtime=truyn-runtime@truyn-private-prod.iam.gserviceaccount.com\n"
    )
else:
    raise SystemExit(f"unknown private cloud fixture: {kind}")

with tarfile.open(tar_path, "w:gz") as tf:
    member = tarfile.TarInfo(member_name)
    member.size = len(payload)
    tf.addfile(member, io.BytesIO(payload))

with zipfile.ZipFile(zip_path, "w") as zf:
    zf.writestr(member_name, payload)
`;

const archiveBombGenerator = String.raw`
import sys
import tarfile
import zipfile
from pathlib import Path

root = Path(sys.argv[1]).resolve()
kind = sys.argv[2]
tar_path = root / f"archive-bomb-{kind}.tgz"
zip_path = root / f"archive-bomb-{kind}.nupkg"

MAX_MEMBERS = 4096
MAX_MEMBER_BYTES = 32 * 1024 * 1024
TOTAL_PART_BYTES = 22 * 1024 * 1024

if kind == "member-count":
    with tarfile.open(tar_path, "w:gz") as tf:
        for index in range(MAX_MEMBERS + 1):
            member = tarfile.TarInfo(f"package/member-{index:05d}.txt")
            member.size = 0
            tf.addfile(member)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for index in range(MAX_MEMBERS + 1):
            zf.writestr(f"package/member-{index:05d}.txt", b"")
elif kind == "member-size":
    source = root / "oversized-member.bin"
    with source.open("wb") as handle:
        handle.seek(MAX_MEMBER_BYTES)
        handle.write(b"\0")
    with tarfile.open(tar_path, "w:gz") as tf:
        tf.add(source, arcname="package/oversized-member.bin")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(source, arcname="package/oversized-member.bin")
elif kind == "total-size":
    sources = []
    for index in range(3):
        source = root / f"total-part-{index}.bin"
        with source.open("wb") as handle:
            handle.seek(TOTAL_PART_BYTES - 1)
            handle.write(b"\0")
        sources.append(source)
    with tarfile.open(tar_path, "w:gz") as tf:
        for index, source in enumerate(sources):
            tf.add(source, arcname=f"package/total-part-{index}.bin")
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for index, source in enumerate(sources):
            zf.write(source, arcname=f"package/total-part-{index}.bin")
else:
    raise SystemExit(f"unknown archive bomb fixture: {kind}")
`;

function generateFixtures(root, attack) {
  execFileSync(python, ['-c', generator, root, attack], { stdio: 'pipe' });
}

function assertDenied(archive, destination) {
  const result = spawnSync(python, [extractor, archive, destination], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, `malicious archive unexpectedly accepted: ${archive}`);
  assert.match(result.stderr, /^DENIED /m, `missing fail-closed DENIED marker for ${archive}`);
  return result;
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

test('SDK release safe extractor denies private-key material in tar and zip members', () => {
  const root = mkdtempSync(join(tmpdir(), 'truyn-sdk-private-key-'));
  try {
    execFileSync(python, ['-c', privateKeyGenerator, root], { stdio: 'pipe' });

    const tarDestination = join(root, 'extract-secret-tar');
    const zipDestination = join(root, 'extract-secret-zip');
    const tarResult = assertDenied(join(root, 'private-key.tgz'), tarDestination);
    const zipResult = assertDenied(join(root, 'private-key.nupkg'), zipDestination);

    assert.match(tarResult.stderr, /private key material/i);
    assert.match(zipResult.stderr, /private key material/i);
    assert.equal(existsSync(join(tarDestination, 'package', 'config.txt')), false);
    assert.equal(existsSync(join(zipDestination, 'package', 'config.txt')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const kind of ['token', 'credential']) {
  test(`SDK release safe extractor denies ${kind} material in tar and zip members`, () => {
    const root = mkdtempSync(join(tmpdir(), `truyn-sdk-${kind}-`));
    try {
      execFileSync(python, ['-c', credentialGenerator, root, kind], { stdio: 'pipe' });

      const tarDestination = join(root, `extract-${kind}-tar`);
      const zipDestination = join(root, `extract-${kind}-zip`);
      const tarResult = assertDenied(join(root, `${kind}.tgz`), tarDestination);
      const zipResult = assertDenied(join(root, `${kind}.nupkg`), zipDestination);

      assert.match(tarResult.stderr, /credential material/i);
      assert.match(zipResult.stderr, /credential material/i);
      assert.equal(existsSync(join(tarDestination, 'package', 'settings.txt')), false);
      assert.equal(existsSync(join(zipDestination, 'package', 'settings.txt')), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

for (const kind of ['azure', 'gcp']) {
  test(`SDK release safe extractor denies ${kind} private cloud topology in tar and zip members`, () => {
    const root = mkdtempSync(join(tmpdir(), `truyn-sdk-private-cloud-${kind}-`));
    try {
      execFileSync(python, ['-c', privateCloudGenerator, root, kind], { stdio: 'pipe' });

      const tarDestination = join(root, `extract-private-cloud-${kind}-tar`);
      const zipDestination = join(root, `extract-private-cloud-${kind}-zip`);
      const tarResult = assertDenied(join(root, `private-cloud-${kind}.tgz`), tarDestination);
      const zipResult = assertDenied(join(root, `private-cloud-${kind}.nupkg`), zipDestination);

      assert.match(tarResult.stderr, /private cloud topology/i);
      assert.match(zipResult.stderr, /private cloud topology/i);
      assert.doesNotMatch(tarResult.stderr, /11111111-2222-3333-4444-555555555555|123456789012/);
      assert.doesNotMatch(zipResult.stderr, /11111111-2222-3333-4444-555555555555|123456789012/);
      assert.equal(existsSync(join(tarDestination, 'package', 'topology.txt')), false);
      assert.equal(existsSync(join(zipDestination, 'package', 'topology.txt')), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

const bombCases = [
  ['member-count', /archive member count limit exceeded/i, 'package/member-00000.txt'],
  ['member-size', /archive member uncompressed size limit exceeded/i, 'package/oversized-member.bin'],
  ['total-size', /archive total uncompressed size limit exceeded/i, 'package/total-part-0.bin'],
];

for (const [kind, expectedError, memberPath] of bombCases) {
  test(`SDK release safe extractor denies ${kind} archive bombs in tar and zip families`, () => {
    const root = mkdtempSync(join(tmpdir(), `truyn-sdk-archive-bomb-${kind}-`));
    try {
      execFileSync(python, ['-c', archiveBombGenerator, root, kind], { stdio: 'pipe' });

      const tarDestination = join(root, `extract-bomb-${kind}-tar`);
      const zipDestination = join(root, `extract-bomb-${kind}-zip`);
      const tarResult = assertDenied(join(root, `archive-bomb-${kind}.tgz`), tarDestination);
      const zipResult = assertDenied(join(root, `archive-bomb-${kind}.nupkg`), zipDestination);

      assert.match(tarResult.stderr, expectedError);
      assert.match(zipResult.stderr, expectedError);
      assert.equal(existsSync(join(tarDestination, memberPath)), false);
      assert.equal(existsSync(join(zipDestination, memberPath)), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
