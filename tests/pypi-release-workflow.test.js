import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const workflowUrl = new URL('../.github/workflows/publish-sdk-alpha.yml', import.meta.url);
const legacyWorkflowUrl = new URL('../.github/workflows/publish-python-alpha.yml', import.meta.url);
const workflow = await readFile(workflowUrl, 'utf8');
const marker = JSON.parse(await readFile(new URL('../sdk/release/pypi-alpha-bootstrap.json', import.meta.url), 'utf8'));

test('PyPI uses only the canonical SDK release workflow', async () => {
  await assert.rejects(access(legacyWorkflowUrl));
  assert.match(workflow, /publish-pypi:/);
  assert.match(workflow, /publish-pypi:[\s\S]*?environment: sdk-release/);
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /SOURCE_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
});

test('PyPI bounded retry is revision 3 and matches immutable coordinate', () => {
  assert.match(workflow, /if \[\[ "\$marker_revision" -lt 3 \]\]; then/);
  assert.match(workflow, /'workflowRevision': 3/);
  assert.deepEqual(marker, {
    package: 'truyn-sdk',
    version: '0.1.0a1',
    channel: 'alpha',
    bootstrap: true,
    workflowRevision: 3,
    sourceDateEpoch: 1788457969
  });
});

test('PyPI alpha release requires same-SHA CodeQL and Trusted Publishing', () => {
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /dynamic\/github-code-scanning\/codeql/);
  assert.match(workflow, /pypa\/gh-action-pypi-publish@release\/v1/);
  assert.doesNotMatch(workflow, /PYPI_TOKEN/);
  assert.doesNotMatch(workflow, /password:/);
});

test('PyPI build is reproducible and locally verified before publication', () => {
  assert.match(workflow, /SOURCE_DATE_EPOCH: '1788457969'/);
  assert.match(workflow, /python -m build sdk\/python --outdir sdk\/release\/pypi-local/);
  assert.match(workflow, /python -m twine check sdk\/release\/pypi-local\/\*/);
  assert.match(workflow, /sha256sum sdk\/release\/pypi-local\/\* \| sort \| tee sdk\/release\/pypi-SHA256SUMS/);
  assert.match(workflow, /pip install --disable-pip-version-check 'cryptography>=43,<47'/);
  assert.match(workflow, /--no-index --no-deps --find-links sdk\/release\/pypi-local/);
});

test('PyPI release verifies registry bytes, PEP 740 provenance and clean install', () => {
  assert.match(workflow, /PyPI byte mismatch/);
  assert.match(workflow, /pypi-attestations verify pypi --repository https:\/\/github\.com\/inn-media\/truyn/);
  assert.match(workflow, /pep740Provenance.*PASS/);
  assert.match(workflow, /--index-url https:\/\/pypi\.org\/simple/);
  assert.match(workflow, /cleanRoomInstall.*PASS/);
  assert.match(workflow, /pypi-release-evidence\.json/);
});
