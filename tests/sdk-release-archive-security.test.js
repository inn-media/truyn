import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const python = process.env.PYTHON ?? 'python';
const extractor = resolve('sdk/release/safe-extract.py');

const generator = String.raw`
import base64
import io
import sys
import tarfile
import zipfile
from pathlib import Path

root = Path(sys.argv[1]).resolve()
kind = sys.argv[2]
samples = {
    "private-key": "Y29uZmlnCi0tLS0tQkVHSU4gUFJJVkFURSBLRVktLS0tLQpabUZyWlE9PQotLS0tLUVORCBQUklWQVRFIEtFWS0tLS0tCg==",
    "token": "YXV0aG9yaXphdGlvbj1naHBfQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUEK",
    "credential": "Y2xpZW50X3NlY3JldD1UcnV5bkZpeHR1cmVDcmVkZW50aWFsVmFsdWUxMjM0NTY3ODkwCg==",
    "azure": "QVpVUkVfU1VCU0NSSVBUSU9OX0lEPTExMTExMTExLTIyMjItMzMzMy00NDQ0LTU1NTU1NTU1NTU1NQpyZXNvdXJjZT0vc3Vic2NyaXB0aW9ucy8xMTExMTExMS0yMjIyLTMzMzMtNDQ0NC01NTU1NTU1NTU1NTUvcmVzb3VyY2VHcm91cHMvdHJ1eW4tcHJvZC9wcm92aWRlcnMvTWljcm9zb2Z0LkRvY3VtZW50REIvZGF0YWJhc2VBY2NvdW50cy90cnV5bi1wcm9kLWNvc21vcwplbmRwb2ludD1odHRwczovL3RydXlucHJvZHZhdWx0LnZhdWx0LmF6dXJlLm5ldAo=",
    "gcp": "R0NQX1BST0pFQ1RfTlVNQkVSPTEyMzQ1Njc4OTAxMgp3aWY9cHJvamVjdHMvMTIzNDU2Nzg5MDEyL2xvY2F0aW9ucy9nbG9iYWwvd29ya2xvYWRJZGVudGl0eVBvb2xzL3RydXluLXByb2QtcG9vbC9wcm92aWRlcnMvZ2l0aHViCnJ1bnRpbWU9dHJ1eW4tcnVudGltZUB0cnV5bi1wcml2YXRlLXByb2QuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20K",
}
payload = base64.b64decode(samples[kind])
name = "package/fixture.txt"
for suffix, writer in (("tgz", "tar"), ("nupkg", "zip")):
    path = root / f"{kind}.{suffix}"
    if writer == "tar":
        with tarfile.open(path, "w:gz") as archive:
            member = tarfile.TarInfo(name)
            member.size = len(payload)
            archive.addfile(member, io.BytesIO(payload))
    else:
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr(name, payload)
`;

function deny(archive, destination) {
  const result = spawnSync(python, [extractor, archive, destination], { encoding: 'utf8' });
  assert.notEqual(result.status, 0, `${archive} unexpectedly accepted`);
  assert.match(result.stderr, /^DENIED /m);
  return result;
}

const cases = [
  ['private-key', /private key material/i],
  ['token', /credential material/i],
  ['credential', /credential material/i],
  ['azure', /private cloud topology/i],
  ['gcp', /private cloud topology/i],
];

for (const [kind, expected] of cases) {
  test(`SDK release safe extractor denies encoded-at-rest ${kind} fixture in tar and zip`, () => {
    const root = mkdtempSync(join(tmpdir(), `truyn-sdk-${kind}-`));
    try {
      execFileSync(python, ['-c', generator, root, kind], { stdio: 'pipe' });
      for (const suffix of ['tgz', 'nupkg']) {
        const destination = join(root, `extract-${suffix}`);
        const result = deny(join(root, `${kind}.${suffix}`), destination);
        assert.match(result.stderr, expected);
        assert.equal(existsSync(join(destination, 'package', 'fixture.txt')), false);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
