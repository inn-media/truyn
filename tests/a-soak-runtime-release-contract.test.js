import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../.github/workflows/a-soak-wan-runtime-release.yml',import.meta.url),'utf8');
const build=readFileSync(new URL('../scripts/build-class-d-1000-runtime-bundle.sh',import.meta.url),'utf8');
const guard=readFileSync(new URL('./public-repository.test.js',import.meta.url),'utf8');
test('public WAN-runtime release cannot run on a PR, push, untrusted branch, or failed exact-main safety CI',()=>{
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/\n\s*pull_request:/);
 assert.doesNotMatch(workflow,/\n\s*push:/);
 assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/BLOCKED_MOVING_MAIN/);
 assert.match(workflow,/BLOCKED_EXACT_MAIN_CHECK/);
 for(const job of ['mandatory-security-safety','network','integration','component','regression','DCO','test','Analyze (javascript-typescript)','Analyze (actions)'])
   assert.ok(workflow.includes(job),job);
 assert.match(workflow,/BLOCKED_PAGINATION/);
});
test('frozen runtime is hash-pinned, source-checked, and published no more than once',()=>{
 assert.match(workflow,/scripts\/build-class-d-1000-runtime-bundle\.sh/);
 assert.match(workflow,/TRUYN_TESTED_COMMIT="\$GITHUB_SHA"/);
 assert.match(workflow,/sha256sum --check/);
 assert.match(workflow,/\.schema=="truyn\.class-d1000\.runtime-bundle\.v1"/);
 assert.match(workflow,/\.sourceSha==\$sha/);
 assert.match(workflow,/BLOCKED_DUPLICATE_RELEASE/);
 assert.match(workflow,/BLOCKED_DUPLICATE_TAG/);
 assert.match(workflow,/BLOCKED_MAIN_MOVED_AFTER_BUILD/);
 assert.match(workflow,/gh release create/);
 assert.match(build,/git archive "\$SOURCE_SHA"/);
 assert.match(guard,/\.github\/workflows\/a-soak-wan-runtime-release\.yml/);
});
test('runtime release never allocates clouds or reads private provider secrets',()=>{
 assert.doesNotMatch(workflow,/azure\/login|google-github-actions\/auth|id-token: write/);
 assert.doesNotMatch(workflow,/az vm create|gcloud compute instances create/);
 const forbiddenProviderCredentialNames = [
  ['AZURE','CLIENT','ID'].join('_'),
  ['GCP','WIF','PROVIDER'].join('_'),
  ['GCP','DEPLOYER','SERVICE','ACCOUNT','EMAIL'].join('_')
 ];
 for (const identifier of forbiddenProviderCredentialNames) assert.ok(!workflow.includes(identifier), `release workflow contains provider credential reference: ${identifier}`);
});

test('runtime release independently qualifies DCO on exact main and request stays single-shot and non-cloud',()=>{
 assert.match(workflow,/scripts\/check-dco\.mjs/);
 assert.match(workflow,/A_SOAK_EXACT_MAIN_DCO=PASS/);
 assert.match(workflow,/fetch-depth: 2/);
 const request=readFileSync(new URL('../.github/workflows/a-soak-wan-runtime-release-request.yml',import.meta.url),'utf8');
 assert.match(request,/branches: \[main\]/);
 assert.match(request,/GITHUB_RUN_ATTEMPT/);
 assert.match(request,/A_SOAK_RUNTIME_REQUEST=EXACT_MAIN_ADMITTED/);
 assert.match(request,/A_SOAK_WAN_RUNTIME_RELEASE=PUBLISHED/);
 assert.match(request,/contents: write/);
 assert.match(request,/scripts\/build-class-d-1000-runtime-bundle\.sh/);
 assert.match(request,/sha256sum --check/);
 assert.match(request,/BLOCKED_DUPLICATE_RELEASE/);
 assert.match(request,/BLOCKED_DUPLICATE_TAG/);
 assert.match(request,/BLOCKED_MOVING_MAIN_AFTER_BUILD/);
 assert.match(request,/gh release create/);
 assert.doesNotMatch(request,/gh workflow run a-soak-wan-runtime-release\.yml/);
 assert.doesNotMatch(request,/azure\/login|google-github-actions\/auth|az vm create|gcloud compute instances create/);
});
