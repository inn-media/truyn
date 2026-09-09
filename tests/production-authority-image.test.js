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

test('authority image uses only the accepted full-SHA tag and never image latest', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /IMAGE_REPOSITORY: truyn-authority/);
  assert.match(workflow, /image_name="\$\{IMAGE_REPOSITORY\}:\$\{SOURCE_SHA\}"/);
  assert.match(workflow, /--image "\$image_name"/);
  assert.doesNotMatch(workflow, /truyn-authority:latest\b/i);
  assert.doesNotMatch(workflow, /--image\s+["']?[^"'\n]*:latest\b/i);
  assert.doesNotMatch(workflow, /image_name=.*:latest\b/i);
});

test('authority image build completes before its post-build digest is resolved', async () => {
  const workflow = await workflowText();
  const buildIndex = workflow.indexOf('az acr build');
  const postBuildDigestIndex = workflow.indexOf('az acr manifest show-metadata', buildIndex);
  assert.ok(buildIndex >= 0 && postBuildDigestIndex > buildIndex);
  assert.doesNotMatch(workflow, /--no-logs/);
});

test('existing and newly published authority images require both tag and manifest rewrite/delete locks', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /verify_tag_and_manifest_locked\(\)/);
  assert.match(workflow, /az acr repository show-tags/);
  assert.match(workflow, /changeableAttributes\.writeEnabled == false/);
  assert.match(workflow, /changeableAttributes\.deleteEnabled == false/);
  assert.match(workflow, /Authority SHA tag is not locked against rewrite and delete/);
  assert.match(workflow, /--image "\$\{IMAGE_REPOSITORY\}@\$\{digest\}"/);
  assert.match(workflow, /Authority manifest is not locked against rewrite and delete/);
  assert.match(workflow, /--write-enabled false/);
  assert.match(workflow, /--delete-enabled false/);
  assert.match(workflow, /verify_tag_and_manifest_locked "\$existing_digest"/);
  assert.match(workflow, /verify_tag_and_manifest_locked "\$digest"/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test('Container Apps CLI discovery is enabled explicitly before registry discovery', async () => {
  const workflow = await workflowText();
  const installIndex = workflow.indexOf('az extension add --name containerapp');
  const discoveryIndex = workflow.indexOf('az containerapp env show');
  assert.ok(installIndex >= 0 && discoveryIndex > installIndex);
  assert.match(workflow, /extension\.use_dynamic_install=yes_without_prompt/);
});

test('authority image digest is resolved from ACR and recorded as sanitized evidence', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /az acr manifest show-metadata/);
  assert.match(workflow, /\^sha256:\[0-9a-f\]\{64\}\$/);
  assert.match(workflow, /AUTHORITY_IMAGE_DIGEST/);
  assert.match(workflow, /truyn\.production-authority-image-evidence\/v1/);
  assert.match(workflow, /immutableReference/);
  assert.match(workflow, /writeLocked: true/);
  assert.match(workflow, /deleteLocked: true/);
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
