import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const WORKFLOW = new URL('../.github/workflows/production-authority-image.yml', import.meta.url);

async function workflowText() {
  return readFile(WORKFLOW, 'utf8');
}

test('authority image build is pinned to the exact accepted source and frozen source blobs', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /SOURCE_SHA: 37144e03eaba714be26d106b3b0d396f0801f7d6/);
  assert.match(workflow, /SOURCE_DOCKERFILE_BLOB: e56b6ad46e7ee1e7963a0e039299d0da98a303ba/);
  assert.match(workflow, /SOURCE_PACKAGE_JSON_BLOB: 24f660c5238f49dce468647684074f63d1a3adc7/);
  assert.match(workflow, /ref: \$\{\{ env\.SOURCE_SHA \}\}/);
  assert.match(workflow, /git rev-parse HEAD:Dockerfile/);
  assert.match(workflow, /git rev-parse HEAD:package\.json/);
});

test('build inputs eliminate mutable base tags and time-unbounded npm resolution', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /BASE_IMAGE: node:22-bookworm-slim@sha256:[0-9a-f]{64}/);
  assert.match(workflow, /NPM_BEFORE: '2026-09-08T18:53:08Z'/);
  assert.match(workflow, /Dockerfile\.authority/);
  assert.match(workflow, /--before=\$\{NPM_BEFORE\}/);
  assert.match(workflow, /npm ls --all --omit=dev --json/);
  assert.doesNotMatch(workflow, /--image\s+["']?[^"'\\n]*:latest\b/i);
});

test('base-image sed end anchor is escaped from shell positional-parameter expansion', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /sed -i "s#\^FROM node:22-bookworm-slim\\\$#FROM \$\{BASE_IMAGE\}#" Dockerfile\.authority/);
  assert.doesNotMatch(workflow, /sed -i "s#\^FROM node:22-bookworm-slim\$#FROM \$\{BASE_IMAGE\}#" Dockerfile\.authority/);
});

test('OIDC, attestation and production identity values are scoped away from PR-controlled validation', async () => {
  const workflow = await workflowText();
  const jobsIndex = workflow.indexOf('jobs:');
  const global = workflow.slice(0, jobsIndex);
  const validateIndex = workflow.indexOf('  validate:');
  const buildIndex = workflow.indexOf('  build-and-record:');
  const validate = workflow.slice(validateIndex, buildIndex);
  const build = workflow.slice(buildIndex);

  assert.doesNotMatch(global, /id-token:\s*write|attestations:\s*write/);
  assert.doesNotMatch(global, /RESOURCE_GROUP:|REGION_PAIRS:|AZURE_CLIENT_VALUE:|AZURE_TENANT_VALUE:|AZURE_SUBSCRIPTION_VALUE:/);
  assert.doesNotMatch(validate, /id-token:\s*write|attestations:\s*write|azure\/login@v2|az acr build|AZURE_CLIENT_VALUE|AZURE_TENANT_VALUE|AZURE_SUBSCRIPTION_VALUE|RESOURCE_GROUP|REGION_PAIRS|secrets\./);
  assert.match(build, /id-token:\s*write/);
  assert.match(build, /attestations:\s*write/);
  assert.match(build, /RESOURCE_GROUP:/);
  assert.match(build, /REGION_PAIRS:/);
  assert.match(build, /AZURE_CLIENT_VALUE:/);
  assert.match(build, /AZURE_TENANT_VALUE:/);
  assert.match(build, /AZURE_SUBSCRIPTION_VALUE:/);
});

test('reuse is allowed only after cryptographically verified source-bound provenance', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /uses: actions\/attest@v2/);
  assert.match(workflow, /predicate-type: \$\{\{ env\.PROVENANCE_TYPE \}\}/);
  assert.match(workflow, /gh attestation verify/);
  assert.match(workflow, /--deny-self-hosted-runners/);
  assert.match(workflow, /predicate\.sourceSha == \$sourceSha/);
  assert.match(workflow, /predicate\.dockerfileBlob == \$dockerfileBlob/);
  assert.match(workflow, /predicate\.packageJsonBlob == \$packageJsonBlob/);
  assert.match(workflow, /predicate\.baseImage == \$baseImage/);
  assert.match(workflow, /predicate\.npmBefore == \$npmBefore/);
  assert.match(workflow, /predicate\.imageDigest == \$digest/);
});

test('OCI provenance verification authenticates to the accepted registry first', async () => {
  const workflow = await workflowText();
  const loginIndex = workflow.indexOf('az acr login --name "$REGISTRY_NAME"');
  const verifyIndex = workflow.indexOf('gh attestation verify');
  assert.ok(loginIndex >= 0 && verifyIndex > loginIndex);
});

test('interrupted unlocked image state is recovered by deterministic rebuild instead of wedging retries', async () => {
  const workflow = await workflowText();
  const selectIndex = workflow.indexOf('Build or select immutable authority image');
  const provenanceIndex = workflow.indexOf('Prepare source-bound provenance predicate');
  const select = workflow.slice(selectIndex, provenanceIndex);
  assert.match(select, /if \[\[ "\$existing_digest" =~ \^sha256:\[0-9a-f\]\{64\}\$ \]\] && verify_locked "\$existing_digest"; then/);
  assert.match(select, /Recovering an interrupted unlocked authority image by deterministic rebuild/);
  assert.match(select, /az acr build/);
  assert.doesNotMatch(select, /Existing authority image is not terminally locked/);
});

test('both tag and manifest are terminally locked only after provenance verification', async () => {
  const workflow = await workflowText();
  const provenanceIndex = workflow.indexOf('Verify source-bound provenance before acceptance or reuse');
  const lockIndex = workflow.indexOf('Terminally lock a newly attested image');
  assert.ok(provenanceIndex >= 0 && lockIndex > provenanceIndex);
  assert.match(workflow, /--write-enabled false/);
  assert.match(workflow, /--delete-enabled false/);
  assert.match(workflow, /Authority SHA tag is not locked against rewrite and delete/);
  assert.match(workflow, /Authority manifest is not locked against rewrite and delete/);
  assert.match(workflow, /cancel-in-progress: false/);
});

test('authority image build completes before its post-build digest is resolved', async () => {
  const workflow = await workflowText();
  const buildIndex = workflow.indexOf('az acr build');
  const postBuildDigestIndex = workflow.indexOf('az acr manifest show-metadata', buildIndex);
  assert.ok(buildIndex >= 0 && postBuildDigestIndex > buildIndex);
  assert.doesNotMatch(workflow, /--no-logs/);
});

test('Container Apps CLI discovery is enabled before registry discovery', async () => {
  const workflow = await workflowText();
  const installIndex = workflow.indexOf('az extension add --name containerapp');
  const discoveryIndex = workflow.indexOf('az containerapp env show');
  assert.ok(installIndex >= 0 && discoveryIndex > installIndex);
  assert.match(workflow, /extension\.use_dynamic_install=yes_without_prompt/);
});

test('sanitized evidence records digest, provenance and immutable locks without topology', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /truyn\.production-authority-image-evidence\/v2/);
  assert.match(workflow, /provenanceVerified:true/);
  assert.match(workflow, /immutableReference/);
  assert.match(workflow, /writeLocked:true/);
  assert.match(workflow, /deleteLocked:true/);
  assert.match(workflow, /mutableTagUsed:false/);
  assert.match(workflow, /status:"PASS"/);
  assert.match(workflow, /production-authority-image-evidence\.json/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});

test('Azure mutation remains push-to-main only and PR execution is validation-only', async () => {
  const workflow = await workflowText();
  assert.match(workflow, /if: github\.event_name == 'pull_request'/);
  assert.match(workflow, /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
});
