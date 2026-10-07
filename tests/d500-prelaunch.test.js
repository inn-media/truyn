import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { validate, D500_TOPOLOGY } from '../scripts/check-d500-contract.mjs';

const d200 = JSON.parse(fs.readFileSync('config/d200-contract.json', 'utf8'));
const d500 = JSON.parse(fs.readFileSync('config/d500-contract.json', 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const activeD500Workflows = fs.existsSync('.github/workflows')
  ? fs.readdirSync('.github/workflows').filter((name) => /^d-?500.*\.ya?ml$/i.test(name)).sort()
  : [];
const phase = process.env.D500_PREFLIGHT_PHASE || 'prepare';

function mustReject(mutator, match) {
  const candidate = clone(d500);
  mutator(candidate);
  assert.throws(() => validate(candidate), match);
}

function assertAttempt2Token(token) {
  assert.match(token, /^TASK_ID=truyn-d500-acceptance-260920-a2$/m);
  assert.match(token, /^REFERENCE_D200_RUN=35503894414$/m);
  assert.match(token, /^REFERENCE_D200_REPEATABILITY_RUN=35517248924$/m);
  assert.match(token, /^TESTED_COMMIT=585e8b9865a47d8abe390d3dd548c2e57fdd9a32$/m);
  assert.match(token, /^TESTED_TREE_SHA=3fdea23cd2f4740a7f89f88c1c92dc98b4a0a8b3$/m);
  assert.match(token, /^EXACT_MAIN_CI_RUN=35525208894$/m);
  assert.match(token, /^EXACT_MAIN_FIVE_PATCH_RUN=35525209011$/m);
  assert.match(token, /^EXACT_MAIN_CODEQL_RUN=35525208504$/m);
  assert.match(token, /^D500_CONTRACT_SHA256=469e7354eda2b42e90341c4665aa1dea623cbdaa5b63ab3a8a5889e913fd8f85$/m);
  assert.match(token, /^WORKFLOW_BLOB_SHA=20a8dd7d9c0267f4851deadd34dddcfa5ee600a9$/m);
}

function assertAttempt3Token(token) {
  assert.match(token, /^TASK_ID=truyn-d500-acceptance-260922-a3$/m);
  assert.match(token, /^REFERENCE_D200_RUN=35503894414$/m);
  assert.match(token, /^REFERENCE_D200_REPEATABILITY_RUN=35517248924$/m);
  assert.match(token, /^TESTED_COMMIT=0f17a41b91df4e7ff914e43b0dcab3da39cea4cb$/m);
  assert.match(token, /^TESTED_TREE_SHA=c28d71f49804cbac81a8fd783ca30d912acc5201$/m);
  assert.match(token, /^EXACT_MAIN_CI_RUN=35690793896$/m);
  assert.match(token, /^EXACT_MAIN_FIVE_PATCH_RUN=35690793984$/m);
  assert.match(token, /^EXACT_MAIN_CODEQL_RUN=35690793647$/m);
  assert.match(token, /^D500_CONTRACT_SHA256=469e7354eda2b42e90341c4665aa1dea623cbdaa5b63ab3a8a5889e913fd8f85$/m);
  assert.match(token, /^WORKFLOW_BLOB_SHA=1d5dee8150595eb8f61f96e0c235840576217ef5$/m);
}

test('D-500 canonical contract is exactly 20 hosts x 25 real processes = 500', () => {
  assert.equal(validate(d500), true);
  assert.deepEqual({
    hostsRequired: d500.hostsRequired,
    processTarget: d500.processTarget,
    nodesPerHost: d500.nodesPerHost,
    restartNodesPerHostRequired: d500.restartNodesPerHostRequired,
    restartNodeTarget: d500.restartNodeTarget,
  }, D500_TOPOLOGY);
  assert.equal(d500.processTarget, d500.hostsRequired * d500.nodesPerHost);
  assert.equal(d500.restartNodeTarget, d500.hostsRequired * d500.restartNodesPerHostRequired);
});

test('D-500 cannot weaken accepted D-200 routing, recovery, safety, cleanup or peer bounds', () => {
  assert.ok(d500.routingAcceptanceMinimum >= d200.routingAcceptanceMinimum);
  assert.ok(d500.convergenceMaximumMs <= d200.convergenceMaximumMs);
  assert.ok(d500.recoveryMaximumMs <= d200.recoveryMaximumMs);
  assert.ok(d500.maxPeers <= d200.maxPeers);
  assert.ok(d500.acknowledgedWritesRequired >= d200.acknowledgedWritesRequired);
  assert.ok(d500.acknowledgedWriteLossAllowed <= d200.acknowledgedWriteLossAllowed);
  assert.ok(d500.safetyViolationsAllowed <= d200.safetyViolationsAllowed);
  assert.ok(d500.cleanupRemainingAllowed <= d200.cleanupRemainingAllowed);
  assert.ok(d500.stagingCleanupRemainingAllowed <= d200.stagingCleanupRemainingAllowed);
  assert.ok(d500.peerRecordTtlMs >= d200.peerRecordTtlMs);
  assert.ok(d500.bootstrapMinPeerLeaseRemainingMs >= d200.bootstrapMinPeerLeaseRemainingMs);
  assert.equal(d500.allToAllForbidden, true);
});

test('D-500 anti-weakening checker rejects lower routing acceptance', () => {
  mustReject((c) => { c.routingAcceptanceMinimum = 0.98; }, /routingAcceptanceMinimum/);
});

test('D-500 anti-weakening checker rejects larger peer fanout', () => {
  mustReject((c) => { c.maxPeers = d200.maxPeers + 1; }, /maxPeers/);
});

test('D-500 anti-weakening checker rejects slower recovery ceiling', () => {
  mustReject((c) => { c.recoveryMaximumMs = d200.recoveryMaximumMs + 1; }, /recoveryMaximumMs/);
});

test('D-500 checker rejects topology drift and synthetic scale shortcuts', () => {
  mustReject((c) => { c.nodesPerHost = 20; c.processTarget = 400; }, /nodesPerHost|processTarget/);
  mustReject((c) => { c.hostsRequired = 25; c.processTarget = 625; }, /hostsRequired|processTarget/);
});

test('D-500 inheritance manifest preserves accepted D-200/Class-D components', () => {
  const run = spawnSync(process.execPath, ['scripts/check-d500-inheritance.mjs'], { encoding: 'utf8' });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /TRUYN_D500_INHERITANCE=PASS/);
});

test('shared Class-D provisioner already supports the 25-process D-500 mode', () => {
  const provision = fs.readFileSync('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');
  assert.match(provision, /HOST_COUNT=20/);
  assert.match(provision, /DIAGNOSTIC_NODES_PER_HOST_SIZES="10 25 50"/);
  assert.match(provision, /TRUYN_CLASS_D1000_NODES_PER_HOST/);
});

test('first D-500 gate preserves the proven 100-node restart slice', () => {
  const restart = fs.readFileSync('benchmarks/scale/d200-restart-recovery-stage.sh', 'utf8');
  assert.match(restart, /restart_first_node=5/);
  assert.match(restart, /restart_last_node=9/);
  assert.equal(d500.restartNodesPerHostRequired, 5);
  assert.equal(d500.restartNodeTarget, 100);
});

test('D-500 workflow surface preserves immutable launch history', () => {
  const launches = fs.readdirSync('.github/d500')
    .map((name) => name.match(/^launch-(\d{2})\.txt$/))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);

  assert.deepEqual(activeD500Workflows, ['d500-scale-run.yml']);
  assert.ok(launches.includes(1), 'attempt 1 launch evidence must remain preserved');
  assert.ok(launches.includes(2), 'attempt 2 launch evidence must remain preserved');
  assert.ok(launches.includes(3), 'attempt 3 launch evidence must remain preserved');
  assert.ok(launches.includes(19), 'current immutable attempt 19 token must be preserved');
  assert.equal(launches.includes(20), false, 'A20 preparation must not create launch-20.txt');

  assertAttempt2Token(fs.readFileSync('.github/d500/launch-02.txt', 'utf8'));
  assertAttempt3Token(fs.readFileSync('.github/d500/launch-03.txt', 'utf8'));
  assert.equal(fs.readFileSync('.github/d500/launch-19.txt', 'utf8').trim(), 'attempt=19');

  assert.equal(fs.existsSync('.github/d500/d500-acceptance.template.yml'), true);
  assert.equal(fs.existsSync('.github/d500/launch-01.template.txt'), true);
  assert.equal(fs.existsSync('.github/d500/launch-02.template.txt'), true);
});

test('current D-500 workflow preserves the strict scale contract for immutable attempt 19', () => {
  const workflow = fs.readFileSync('.github/workflows/d500-scale-run.yml', 'utf8');
  const launchMatch = workflow.match(/\.github\/d500\/launch-(\d{2})\.txt/);
  assert.ok(launchMatch, 'active D-500 workflow must pin an immutable launch token');
  assert.equal(Number(launchMatch[1]), 19);
  assert.equal(fs.existsSync('.github/d500/launch-19.txt'), true);
  assert.equal(fs.existsSync('.github/d500/launch-20.txt'), false);

  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /truyn-d500-attempt19-single-shot/);
  assert.match(workflow, /TESTED_COMMIT: [0-9a-f]{40}/);
  assert.match(workflow, /TESTED_TREE_SHA: [0-9a-f]{40}/);
  assert.match(workflow, /EXACT_MAIN_CI_RUN: '[0-9]+'/);
  assert.match(workflow, /EXACT_MAIN_FIVE_PATCH_RUN: '[0-9]+'/);
  assert.match(workflow, /NODES_PER_HOST: '25'/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /azure\/login@v2/);
  assert.match(workflow, /Build immutable runtime bundle/);
  assert.match(workflow, /Stage immutable runtime bundle with OIDC data-plane auth/);
  assert.match(workflow, /Execute real 20-host 500-process campaign/);
  assert.match(workflow, /TRUYN_CLASS_D1000_NODES_PER_HOST="\$NODES_PER_HOST"/);

  assert.match(workflow, /\.topology\.hostCount==20/);
  assert.match(workflow, /\.topology\.nodeCount==500/);
  assert.match(workflow, /\.topology\.realProcessCount==500/);
  assert.match(workflow, /\.topology\.realProcessesPerHost==25/);
  assert.match(workflow, /\.routing\.baselineSuccessRatio>=\.99/);
  assert.match(workflow, /\.routing\.postRestartSuccessRatio>=\.99/);
  assert.match(workflow, /\.routing\.healedSuccessRatio>=\.99/);
  assert.match(workflow, /\.convergence\.routingSuccessRatio>=\.99/);
  assert.match(workflow, /\.recovery\.latencyMs\.p95<=120000/);
  assert.match(workflow, /\.recovery\.packetPartitionRecoveryMs<=120000/);
  assert.match(workflow, /\.safety\.acknowledgedWriteCount==100/);
  assert.match(workflow, /\.safety\.acknowledgedWriteLossCount==0/);
  assert.match(workflow, /\.cleanup\.confirmed==true/);
  assert.match(workflow, /\.cleanup\.remainingResources==0/);
  assert.match(workflow, /TRUYN_D500_TERMINAL result=\$result/);
  assert.doesNotMatch(workflow, /workflow_dispatch:/);
});

test('D-500 launcher template inherits immutable qualification and strict terminal semantics', () => {
  const template = fs.readFileSync('.github/d500/d500-acceptance.template.yml', 'utf8');
  assert.match(template, /REFERENCE_D200_RUN: '35503894414'/);
  assert.match(template, /NODES_PER_HOST: '25'/);
  assert.match(template, /TRUYN_CLASS_D1000_NODES_PER_HOST="\$NODES_PER_HOST"/);
  assert.match(template, /\.topology\.nodeCount==500/);
  assert.match(template, /\.topology\.realProcessesPerHost==25/);
  assert.match(template, /\.recovery\.restartedNodeCount==100/);
  assert.match(template, /TRUYN_D500_TERMINAL result=\$result/);
  assert.match(template, /staging_cleanup/);
});

test('D-500 attempt-2 template stays incomplete while a launched token stays immutable and fully qualified', () => {
  if (!fs.existsSync('.github/d500/launch-01.txt')) return;
  const template = fs.readFileSync('.github/d500/launch-02.template.txt', 'utf8');
  assert.match(template, /TASK_ID=truyn-d500-acceptance-260920-a2/);
  assert.match(template, /REFERENCE_D200_RUN=35503894414/);
  assert.match(template, /REFERENCE_D200_REPEATABILITY_RUN=35517248924/);
  assert.match(template, /WORKFLOW_BLOB_SHA=__WORKFLOW_BLOB_SHA__/);

  if (!fs.existsSync('.github/d500/launch-02.txt')) return;
  assertAttempt2Token(fs.readFileSync('.github/d500/launch-02.txt', 'utf8'));
});

test('accepted D-200 evidence remains authoritative and explicitly does not claim D-500', () => {
  const report = fs.readFileSync('docs/benchmarks/CLASS_D_200_2026-09-20.md', 'utf8');
  assert.match(report, /35503894414/);
  assert.match(report, /TRUYN_D200_TERMINAL result=PASS/);
  assert.match(report, /does \*\*not\*\* claim Class D-500/);
});
