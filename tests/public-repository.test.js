import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SELF = 'tests/public-repository.test.js';
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const TEXT_EXTENSIONS = new Set(['.md', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.toml', '.txt', '.proto', '.sh', '.ps1', '.cmd', '.html', '.css']);
const EXECUTABLE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.sh', '.ps1', '.cmd']);
const ALLOWED_WORKFLOWS = new Set([
  '.github/workflows/autonomous-repair.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/a-series-foundation.yml',
  '.github/workflows/a-soak-wan-runtime-release.yml',
  '.github/workflows/a-soak-wan-runtime-release-request.yml',
  '.github/workflows/native-clients.yml',
  '.github/workflows/class-d-blockwise-preflight.yml',
  '.github/workflows/class-d-bootstrap-launcher.yml',
  '.github/workflows/class-d-bootstrap-qualification.yml',
  '.github/workflows/class-d-five-patch-preflight.yml',
  '.github/workflows/d-series-admission-gate.yml',
  '.github/workflows/d-series-blockwise-one-shot-launcher.yml',
  '.github/workflows/d-series-blockwise-preflight.yml',
  '.github/workflows/d-series-candidate-self-admission.yml',
  '.github/workflows/d-series-frozen-candidate-qualification.yml',
  '.github/workflows/d-series-swarm-one-shot-launcher.yml',
  '.github/workflows/d200-acceptance.yml',
  '.github/workflows/d200-repeatability-01.yml',
  '.github/workflows/d200-repeatability-02.yml',
  '.github/workflows/d200-bug-hunt.yml',
  '.github/workflows/d200-live-preflight.yml',
  '.github/workflows/d500-acceptance.yml',
  '.github/workflows/d500-scale-run.yml',
  '.github/workflows/n-series-admission-gate.yml',
  '.github/workflows/n-series-frozen-candidate-qualification.yml',
  '.github/workflows/n-series-public-swarm.yml',
  '.github/workflows/n-series-public-admission.yml',
  '.github/workflows/n-series-one-shot-public-controller.yml',
  '.github/workflows/n-series-public-admission-auto.yml',
  '.github/workflows/s-series-admission-gate.yml',
  '.github/workflows/s-series-frozen-candidate-qualification.yml',
  '.github/workflows/publish-npm.yml',
  '.github/workflows/publish-maven.yml',
  '.github/workflows/publish-nuget.yml',
  '.github/workflows/production-authority-image.yml',
  '.github/workflows/production-authority-source-discovery.yml',
  '.github/workflows/production-dr-foundation.yml',
  '.github/workflows/production-logs-retention.yml',
  '.github/workflows/production-metrics-backend.yml',
  '.github/workflows/production-metrics-collector.yml',
  '.github/workflows/production-monitor-provider-registration.yml',
  '.github/workflows/production-trace-backend.yml',
  '.github/workflows/production-telemetry-redaction.yml'
]);
// Temporary, content-addressed exception for already deployed D-5000 operational workflows.
// This is not a category allowlist: changing even one byte requires explicit review
// and a new independently qualified exact Git blob SHA. Existing secret/topology
// scanners run unchanged on these files, including all credential patterns.
const PINNED_D5000_WORKFLOWS = new Map([
  ['.github/workflows/d5000-attempt10-approved.yml', '2c751778e79279c2cb79164473b230f11199da50'],
  ['.github/workflows/d5000-attempt10-offline-qualification.yml', '479ca1634d35382aa4219a588f20564b86b37565'],
  ['.github/workflows/d5000-attempt9-approved.yml', '7c86730ef36d7df5683d13200ed7bf5ff9586ff6'],
  ['.github/workflows/d5000-attempt9-offline-qualification.yml', 'd079f1bd60cd4a5fbde96b28d7140f9d16aa9eb1'],
  ['.github/workflows/d5000-attempt8-approved.yml', '7120635885e07dda9f07824de735edf9a2e5a0c4'],
  ['.github/workflows/d5000-attempt8-offline-qualification.yml', 'a6499ff877c7c9eee40f229f7eb9b1bdc0b4dde1'],
  ['.github/workflows/d5000-attempt7-approved.yml', '74b90b672c816981d7d836d93bb23a8d4f51b41b'],
  ['.github/workflows/d5000-attempt7-offline-qualification.yml', '5764f8a97a806ba9b5f8f76cfc153fd38a3d0550'],
  ['.github/workflows/d5000-attempt6-approved.yml', '73ec2330948a2af4e7a769b752e5c4e79acbb16f'],
  ['.github/workflows/d5000-attempt6-offline-qualification.yml', '148579d0dfb23587f8209095c0e0de3c73eae473'],
  ['.github/workflows/d5000-attempt5-approved.yml', 'a2953e8583ffa3b49c6101531c9d4412d5d0feb3'],
  ['.github/workflows/d5000-attempt5-offline-qualification.yml', 'aeab1d4ece8f9fbe95f6a4bafafe26ef4bc7b8b3'],
  ['.github/workflows/d5000-attempt4-approved.yml', '84d37d901e0344a2ad0ef651d5b3937f11831a10'],
  ['.github/workflows/d5000-attempt4-offline-qualification.yml', 'a6283ab6fe70072cf97782b8da76371406826bb1'],
  ['.github/workflows/d5000-bootstrap-scale-repair-qualification.yml', '7e66cf0578d768a7f8e0745ee3560d5e3b085353'],
  ['.github/workflows/d5000-attempt3-approved.yml', '6ddc053b8ae4e588a26a0e964e97f1577c9a1379'],
  ['.github/workflows/d5000-posix-sh-repair-qualification.yml', '1001bf41575be018e8c602883054adf1bd775d6e'],
  ['.github/workflows/d5000-attempt2-retry1-approved.yml', 'a402af7871c794a00f8d86662e5c436751d503b9'],
  ['.github/workflows/d5000-attempt2-retry1-qualification.yml', '38c45016bccbb57d7c34b7d4f57fde4f6845990a'],
  ['.github/workflows/d5000-abort-37824934693.yml', '69f30f678d3cf7bcbd4e1270a353f10ebf682536'],
  ['.github/workflows/d5000-attempt1.yml', 'a56e56234196eb97f771e70f1359e530bc6d0948'],
  ['.github/workflows/d5000-attempt2-approved-only.yml', '33b202f6d1743045f19fe98fc212d41b2edc6dcc'],
  ['.github/workflows/d5000-attempt2-clone-attempt1.yml', '555382b45caa4d3f31258d35f40dffba3f06f350'],
  ['.github/workflows/d5000-exact-source-qualification.yml', 'c6f39ced94a9c48f660374ba4646e7b24d2b4098'],
  ['.github/workflows/d5000-force-cancel-37824934693.yml', 'b2c7c49ab6b2c899f6994c6475db2cd606270be0'],
  ['.github/workflows/d5000-p0-p1-repair-qualification.yml', '358e5879d84d5a39a060e90968616ed03cb30fea'],
  ['.github/workflows/d5000-quota-only-20261008.yml', '3f1e77c01adea723e765be323851a6a0163d33f0'],
  ['.github/workflows/d5000-sku-readonly-20261008.yml', '802f2805ac5a02e9875265759c8ccc1dcde470ec'],
]);
function gitBlobSha(content) {
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
}
const BENCHMARK_EVIDENCE_DIR = 'docs/benchmarks/';
const STATIC_AZURE_OIDC_WORKFLOWS = new Set([
  '.github/workflows/class-d-bootstrap-qualification.yml',
  '.github/workflows/d200-repeatability-02.yml',
  '.github/workflows/d500-acceptance.yml'
]);

const protectedBenchmarkEvidence = [
  { path: 'docs/benchmarks/CLASS_C_HETEROGENEOUS_WAN_2026-08-18.md', minBytes: 5000, markers: ['# TRUYN Class C Heterogeneous WAN Acceptance', '## Evidence', '## Measured result', '## What this result does NOT prove'] },
  { path: 'docs/benchmarks/CROSS_CLOUD_AB_2026-08-15.md', minBytes: 5000, markers: ['# TRUYN Cross-Cloud A/B Benchmark', '## Evidence', '## Primary measured result', '## Per-sample evidence'] },
  { path: 'docs/benchmarks/CROSS_CLOUD_8X_OPTIMIZATION_2026-08-15.md', minBytes: 3000, markers: ['# TRUYN Cross-Cloud 8× Hot-Path Optimization', '## Final evidence', '## Fixed-gate result', '## Final relay trace'] },
  { path: 'docs/benchmarks/CONTEXT_EFFICIENCY_2026-08-15.md', minBytes: 5000, markers: ['# TRUYN Content-Addressed Context Economic A/B', '## Evidence', '## Economic result', '## What this result does NOT yet prove'] },
  { path: 'docs/benchmarks/SEMANTIC_RETRIEVAL_GATE_2026-08-15.md', minBytes: 4000, markers: ['# TRUYN Semantic Retrieval Gate', '## Evidence', '## Gate contract', '## Retrieval and provenance proof'] },
  { path: 'docs/benchmarks/H_ARBITRAGE_2026-09-24.md', minBytes: 7000, markers: ['# H/ARBITRAGE — Final benchmark evidence', 'Status: **PASS / CLOSED**', '## Headline result', '## Immutable evidence anchors', '## Billing / claim boundary', 'H_ARBITRAGE_FINAL = PASS / CLOSED'] },
  { path: 'docs/benchmarks/MULTIMODAL_PROVIDER_PARITY.md', minBytes: 3000, markers: ['# TRUYN Multimodal Provider Parity Benchmark', 'Status: **planned methodology', '## Principle'] }
];
const forbiddenPathFragments = ['.github/workflows/cloud-poc-','.github/workflows/owner-identity-','.github/workflows/smoke-','.github/workflows/deploy-protected-owner-','.github/workflows/deploy-owner-','config/owner-benchmark','docs/providers/MULTICLOUD_PROVIDER_IMPLEMENTATION_STATUS_','benchmarks/gemini-direct-proxy','benchmarks/cross-cloud-ab','benchmarks/context-ref-delta-ab','benchmarks/semantic-retrieval-ab','examples/cross-cloud-ai-proof','runtime/vertex-claude-probe','scripts/deploy/azure-owner-','scripts/deploy/gcp-owner-','scripts/prove-owner-fleet','scripts/smoke/'];
const forbiddenPathPatterns = [/^benchmarks\/.*proxy.*\.(?:js|mjs|cjs|sh|ps1|cmd)$/i,/^benchmarks\/Dockerfile\..*proxy/i,/^benchmarks\/.*(?:multiactor|multi-actor).*\.(?:js|mjs|cjs|sh|ps1|cmd)$/i];
const forbiddenLiteralMarkers = ['AZURE_SUBSCRIPTION_ID','AZURE_TENANT_ID','GCP_WIF_PROVIDER','GCP_PROJECT_NUMBER','GCP_DEPLOYER_SERVICE_ACCOUNT_EMAIL','GCP_RUNTIME_SERVICE_ACCOUNT_EMAIL','CLOUDFLARE_API_TOKEN','CLOUDFLARE_API_TOKENS','CLOUDFLARE_ZONE_ID','CLOUDFLARE_ACCOUNT_ID','benchmark-requester-identity','owner-benchmark','truyn-frontdoor','truyn-edge-','relay-origin-group','truyn-gpt-4-1-mini','truyn-gemini','1334540181','github.com/inn-media/truyn/actions/runs/'];
const forbiddenCredentialPatterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bghp_[A-Za-z0-9]{20,}\b/,/\bgithub_pat_[A-Za-z0-9_]{20,}\b/,/\bglpat-[A-Za-z0-9_-]{20,}\b/,/\bAIza[0-9A-Za-z_-]{30,}\b/,/\bAKIA[0-9A-Z]{16}\b/,/\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,/\bsk-ant-[A-Za-z0-9_-]{20,}\b/,/\bsk-(?:live|test)_[A-Za-z0-9]{20,}\b/,/\bsk-[A-Za-z0-9_-]{24,}\b/];
const forbiddenTopologyPatterns = [/https?:\/\/[A-Za-z0-9.-]+\.azurecontainerapps\.io\b/i,/https?:\/\/[A-Za-z0-9.-]+\.run\.app\b/i,/https?:\/\/[A-Za-z0-9.-]+\.vault\.azure\.net\b/i,/https?:\/\/[A-Za-z0-9.-]+\.blob\.core\.windows\.net\b/i,/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com\b/i,/\/subscriptions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,/\bprojects\/[0-9]{6,}\b/i,/\bworkloadIdentityPools\/[A-Za-z0-9._-]+\/providers\/[A-Za-z0-9._-]+\b/];
const forbiddenOperationalExecutablePatterns = [/\bGCE_METADATA_HOST\b/,/computeMetadata\/v1\/instance\/service-accounts\/default\/token/,/\bBENCHMARK_PROXY_TOKEN\b/,/process\.env\.AZURE_OPENAI_API_KEY\b/,/process\.env\.AZURE_FOUNDRY_API_KEY\b/,/process\.env\.GCP_ACCESS_TOKEN\b/];
async function collect(dir = ROOT, out = []) { for (const entry of await readdir(dir,{withFileTypes:true})) { if(entry.name==='.DS_Store') continue; const absolute=path.join(dir,entry.name); const relative=path.relative(ROOT,absolute).replaceAll('\\','/'); if(entry.isDirectory()){if(!SKIP_DIRS.has(entry.name)) await collect(absolute,out); continue;} out.push({absolute,relative}); } return out; }
test('published benchmark evidence is preserved and not replaced by stubs', async()=>{for(const evidence of protectedBenchmarkEvidence){const absolute=path.join(ROOT,evidence.path);let content;try{content=await readFile(absolute,'utf8')}catch(error){assert.fail(`${evidence.path}: protected benchmark evidence is missing (${error.code??error.message})`)}assert.ok(Buffer.byteLength(content,'utf8')>=evidence.minBytes,`${evidence.path}: protected benchmark evidence was unexpectedly truncated`);for(const marker of evidence.markers)assert.ok(content.includes(marker),`${evidence.path}: protected benchmark evidence lost required marker: ${marker}`)}});
test('temporary D-1000 launcher workflows are never committed to the public workflow tree',async()=>{const files=await collect();const temporaryLaunchers=files.map(f=>f.relative).filter(r=>r.startsWith('.github/workflows/tmp-class-d1000-')).sort();assert.deepEqual(temporaryLaunchers,[],`Temporary D-1000 launchers must remain execution scaffolding only:\n${temporaryLaunchers.join('\n')}`)});
test('D-200 acceptance launcher is frozen to the qualified exact-main evidence', async()=>{const content=await readFile(path.join(ROOT,'.github/workflows/d200-acceptance.yml'),'utf8');for(const marker of ['TESTED_COMMIT: e91c165c67c655deb80df4511ca346acb9f1f45b','TESTED_TREE_SHA: 3a402ba72502de12ed2277db3c9f472872f44b46',"EXACT_MAIN_CI_RUN: '35500410155'","EXACT_MAIN_FIVE_PATCH_RUN: '35500410293'","QUALIFIED_TREE_CODEQL_CHECK: '106050818849'",'QUALIFIED_TREE_CODEQL_SHA: 293e3cf5da54e58e37a8d3bb3c138b05bf03e36b','truyn-d200-e91c165c-qualified-single-shot'])assert.ok(content.includes(marker),`D-200 launcher lost qualified freeze marker: ${marker}`);assert.ok(content.includes('source scripts/d200-stage-isolated-campaign.sh'),'D-200 launcher must execute the stage-isolated campaign orchestrator');assert.ok(content.includes('commits/${QUALIFIED_TREE_CODEQL_SHA}" --jq .commit.tree.sha'),'D-200 launcher must bind CodeQL evidence to the exact tested tree')});
test('public repository contains no known operational/cloud leakage or credential patterns',async()=>{const files=await collect();const violations=[];for(const file of files){if(file.relative===SELF)continue;if(file.relative.startsWith('.github/workflows/')&&!ALLOWED_WORKFLOWS.has(file.relative)&&!PINNED_D5000_WORKFLOWS.has(file.relative))violations.push(`${file.relative}: workflow is not on the public allowlist`);if(PINNED_D5000_WORKFLOWS.has(file.relative)){const bytes=await readFile(file.absolute);if(gitBlobSha(bytes)!==PINNED_D5000_WORKFLOWS.get(file.relative))violations.push(`${file.relative}: D-5000 workflow bytes changed from audited Git blob SHA`);}for(const fragment of forbiddenPathFragments)if(file.relative.includes(fragment))violations.push(`${file.relative}: forbidden operational path category`);for(const pattern of forbiddenPathPatterns)if(pattern.test(file.relative))violations.push(`${file.relative}: forbidden operational path pattern`);const ext=path.extname(file.relative).toLowerCase();if(!TEXT_EXTENSIONS.has(ext)&&!['DCO','Dockerfile','LICENSE','VERSION'].includes(path.basename(file.relative)))continue;let content;try{content=await readFile(file.absolute,'utf8')}catch{continue}const isBenchmarkEvidence=file.relative.startsWith(BENCHMARK_EVIDENCE_DIR);for(const marker of forbiddenLiteralMarkers){if(isBenchmarkEvidence&&marker==='github.com/inn-media/truyn/actions/runs/')continue;if(marker==='github.com/inn-media/truyn/actions/runs/'&&file.relative.endsWith('.md')){const nonPublicRunReferences=content.replace(/https:\/\/github\.com\/inn-media\/truyn\/actions\/runs\/[0-9]+(?=[)#\s]|$)/g,'');if(nonPublicRunReferences.includes(marker))violations.push(`${file.relative}: forbidden operational marker category outside exact public evidence URL`);continue;}if(STATIC_AZURE_OIDC_WORKFLOWS.has(file.relative)&&(marker==='AZURE_TENANT_ID'||marker==='AZURE_SUBSCRIPTION_ID')){const exact='${{ secrets.'+marker+' }}';const remainder=content.split(exact).join('');if(remainder.includes(marker))violations.push(`${file.relative}: forbidden operational marker category outside exact static secret reference`);continue;}if(content.includes(marker))violations.push(`${file.relative}: forbidden operational marker category`)}for(const pattern of forbiddenCredentialPatterns)if(pattern.test(content))violations.push(`${file.relative}: credential/private-key pattern detected`);for(const pattern of forbiddenTopologyPatterns)if(pattern.test(content))violations.push(`${file.relative}: live operational topology pattern detected`);if((file.relative.startsWith('benchmarks/')||file.relative.startsWith('scripts/'))&&EXECUTABLE_EXTENSIONS.has(ext))for(const pattern of forbiddenOperationalExecutablePatterns)if(pattern.test(content))violations.push(`${file.relative}: operational cloud credential/proxy code detected`)}assert.deepEqual(violations,[],`Public repository leakage guard failed:\n${violations.join('\n')}`)});