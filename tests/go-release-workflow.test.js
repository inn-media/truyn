import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/go-sdk-alpha-release.yml', import.meta.url), 'utf8');
const marker = JSON.parse(await readFile(new URL('../sdk/release/go-alpha-release.json', import.meta.url), 'utf8'));

test('Go alpha release is bounded to successful exact-main CI', () => {
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows:\s*\n\s*- CI/);
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.doesNotMatch(workflow, /^\s*workflow_dispatch:/m);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /SOURCE_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /git diff --name-only HEAD\^ HEAD \| grep -Fxq "\$RELEASE_MARKER"/);
});

test('Go release has a narrow write boundary and same-SHA security gate', () => {
  assert.match(workflow, /permissions:\s*\n\s*actions: read\s*\n\s*contents: read/);
  assert.match(workflow, /release-go:[\s\S]*environment: sdk-release[\s\S]*permissions:\s*\n\s*actions: read\s*\n\s*contents: write/);
  assert.match(workflow, /dynamic\/github-code-scanning\/codeql/);
  assert.match(workflow, /Hosted CodeQL PASS on \$SOURCE_SHA/);
  assert.doesNotMatch(workflow, /contents: write[\s\S]*id-token: write/);
});

test('Go release uses the canonical submodule SemVer tag and never moves it', () => {
  assert.match(workflow, /MODULE_PATH: github\.com\/inn-media\/truyn\/sdk\/go/);
  assert.match(workflow, /GO_VERSION: v0\.1\.0-alpha\.1/);
  assert.match(workflow, /GO_TAG: sdk\/go\/v0\.1\.0-alpha\.1/);
  assert.match(workflow, /git ls-remote --tags/);
  assert.match(workflow, /Immutable Go release tag \$GO_TAG already resolves to/);
  assert.match(workflow, /gh api --method POST "repos\/\$GITHUB_REPOSITORY\/git\/refs"/);
  assert.match(workflow, /-f ref="refs\/tags\/\$\{GO_TAG\}"/);
  assert.doesNotMatch(workflow, /--force/);
  assert.doesNotMatch(workflow, /git push.*--force/);
});

test('Go release proves proxy, checksum, pkg discovery and clean-room use', () => {
  assert.match(workflow, /GOPROXY=https:\/\/proxy\.golang\.org/);
  assert.match(workflow, /GOSUMDB=sum\.golang\.org/);
  assert.match(workflow, /go list -m -json "\$\{MODULE_PATH\}@\$\{GO_VERSION\}"/);
  assert.match(workflow, /go mod download -json/);
  assert.match(workflow, /https:\/\/proxy\.golang\.org\/\$\{MODULE_PATH\}\/@v\/\$\{GO_VERSION\}\.info/);
  assert.match(workflow, /go get "\$\{MODULE_PATH\}@\$\{GO_VERSION\}"/);
  assert.match(workflow, /truyn\.Protocol != "TRUYN\/1"/);
  assert.match(workflow, /https:\/\/pkg\.go\.dev\/v1\/module\/\$\{MODULE_PATH\}\?version=\$\{GO_VERSION\}/);
  assert.match(workflow, /pkgGoDevDiscovery:\"PASS\"/);
  assert.match(workflow, /go-release-evidence\.json/);
});

test('Go alpha release marker exactly matches the canonical module coordinate', () => {
  assert.deepEqual(marker, {
    module: 'github.com/inn-media/truyn/sdk/go',
    version: 'v0.1.0-alpha.1',
    tag: 'sdk/go/v0.1.0-alpha.1',
    channel: 'alpha',
    workflowRevision: 1
  });
});
