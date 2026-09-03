import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/publish-python-alpha.yml', import.meta.url), 'utf8');
const marker = JSON.parse(await readFile(new URL('../sdk/release/pypi-alpha-bootstrap.json', import.meta.url), 'utf8'));

test('PyPI alpha release is bounded to successful exact-main CI', () => {
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows:\s*\n\s*- CI/);
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.doesNotMatch(workflow, /^\s*pull_request:/m);
  assert.doesNotMatch(workflow, /^\s*push:/m);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /SOURCE_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(workflow, /git diff --name-only HEAD\^ HEAD \| grep -Fxq "\$RELEASE_MARKER"/);
});

test('PyPI alpha release requires same-SHA hosted CodeQL and trusted publishing', () => {
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /dynamic\/github-code-scanning\/codeql/);
  assert.match(workflow, /Hosted CodeQL PASS on \$SOURCE_SHA/);
  assert.match(workflow, /pypa\/gh-action-pypi-publish@release\/v1/);
  assert.doesNotMatch(workflow, /PYPI_TOKEN/);
  assert.doesNotMatch(workflow, /password:/);
});

test('PyPI alpha build is immutable and locally verified before publication', () => {
  assert.match(workflow, /python -m build sdk\/python --outdir sdk\/release\/pypi-local/);
  assert.match(workflow, /python -m twine check sdk\/release\/pypi-local\/\*/);
  assert.match(workflow, /sha256sum sdk\/release\/pypi-local\/\*/);
  assert.match(workflow, /--no-index --find-links sdk\/release\/pypi-local/);
  assert.match(workflow, /PyPI already contains non-identical immutable file/);
});

test('PyPI alpha release verifies registry bytes, PEP 740 provenance and clean install', () => {
  assert.match(workflow, /public PyPI file set does not exactly match local immutable build/);
  assert.match(workflow, /PyPI byte mismatch/);
  assert.match(workflow, /pypi-attestations verify pypi --repository https:\/\/github\.com\/inn-media\/truyn/);
  assert.match(workflow, /pep740Provenance.*PASS/);
  assert.match(workflow, /--index-url https:\/\/pypi\.org\/simple/);
  assert.match(workflow, /cleanRoomInstall.*PASS/);
  assert.match(workflow, /pypi-release-evidence\.json/);
});

test('PyPI alpha bootstrap marker exactly matches the Python package coordinate', () => {
  assert.deepEqual(marker, {
    package: 'truyn-sdk',
    version: '0.1.0a1',
    channel: 'alpha',
    bootstrap: true,
    workflowRevision: 1
  });
});
