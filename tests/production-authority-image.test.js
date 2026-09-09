import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const WORKFLOW = new URL('../.github/workflows/production-authority-image.yml', import.meta.url);

async function workflowText() {
  return readFile(WORKFLOW, 'utf8');
}

test('authority image build is pinned to the exact accepted main source SHA', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /SOURCE_SHA: 37144e03eaba714be26d106b3b0d396f0801f7d6/);
  assert.match(workflow, /ref: \$\{\{ env\.SOURCE_SHA \}\}/);
  assert.match(workflow, /actual_sha="\$\(git rev-parse HEAD\)"/);
  assert.match(workflow, /\[\[ "\$actual_sha" == "\$SOURCE_SHA" \]\]/);
});

test('authority image uses only immutable full-SHA tag and never mutable image latest', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /IMAGE_REPOSITORY: truyn-authority/);
  assert.match(workflow, /image_tag="\$\{IMAGE_REPOSITORY\}:\$\{SOURCE_SHA\}"/);
  assert.match(workflow, /--image "\$image_tag"/);
  assert.doesNotMatch(workflow, /truyn-authority:latest\b/i);
  assert.doesNotMatch(workflow, /image_tag=.*\blatest\b/i);
  assert.doesNotMatch(workflow, /\btag:\s*["']?latest\b/i);
});

test('authority image build completes before digest resolution', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /az acr build/);
  assert.doesNotMatch(workflow, /--no-logs/);
  assert.ok(workflow.indexOf('az acr build') < workflow.indexOf('az acr manifest show-metadata'));
});

test('authority image digest is resolved from ACR and recorded as sanitized evidence', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /az acr manifest show-metadata/);
  assert.match(workflow, /\^sha256:\[0-9a-f\]\{64\}\$/);
  assert.match(workflow, /AUTHORITY_IMAGE_DIGEST/);
  assert.match(workflow, /truyn\.production-authority-image-evidence\/v1/);
  assert.match(workflow, /immutableReference/);
  assert.match(workflow, /mutableTagUsed: false/);
  assert.match(workflow, /status: "PASS"/);
  assert.match(workflow, /production-authority-image-evidence\.json/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});

test('Azure mutation is push-to-main only and PR execution is validation-only', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /if: github\.event_name == 'pull_request'/);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
  const validateIndex = workflow.indexOf('validate:');
  const buildIndex = workflow.indexOf('build-and-record:');
  assert.ok(validateIndex >= 0 && buildIndex > validateIndex);
  assert.doesNotMatch(workflow.slice(validateIndex, buildIndex), /azure\/login@v2|az acr build/);
});
