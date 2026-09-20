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

test('D-500 workflow surface preserves attempt 1 and keeps attempt 2 phase-locked', () => {
  const hasAttempt1 = fs.existsSync('.github/d500/launch-01.txt');
  const hasAttempt2 = fs.existsSync('.github/d500/launch-02.txt');
  assert.equal(hasAttempt2, false, 'attempt 2 launch token must not exist during preparation/qualification');

  if (hasAttempt1) {
    assert.deepEqual(activeD500Workflows, ['d500-acceptance.yml']);
    const token1 = fs.readFileSync('.github/d500/launch-01.txt', 'utf8');
    assert.match(token1, /TASK_ID=truyn-d500-acceptance-260920-a1/);
    assert.match(token1, /WORKFLOW_BLOB_SHA=188a112c2829caec56b583da8cba173d5a5bb86e/);
  } else {
    assert.deepEqual(activeD500Workflows, phase === 'launch' ? ['d500-acceptance.yml'] : []);
  }

  assert.equal(fs.existsSync('.github/d500/d500-acceptance.template.yml'), true);
  assert.equal(fs.existsSync('.github/d500/launch-01.template.txt'), true);
  if (hasAttempt1) assert.equal(fs.existsSync('.github/d500/launch-02.template.txt'), true);
});

test('attempt-2 D-500 workflow is the successful D-200 path plus the minimal scale delta', () => {
  if (!fs.existsSync('.github/d500/launch-01.txt')) return;
  const workflow = fs.readFileSync('.github/workflows/d500-acceptance.yml', 'utf8');
  assert.match(workflow, /\.github\/d500\/launch-02\.txt/);
  assert.match(workflow, /TASK_ID: truyn-d500-acceptance-260920-a2/);
  assert.match(workflow, /REFERENCE_D200_RUN: '35503894414'/);
  assert.match(workflow, /REFERENCE_D200_REPEATABILITY_RUN: '35517248924'/);
  assert.match(workflow, /NODES_PER_HOST: '25'/);
  assert.match(workflow, /client-id: '\$\{\{ secrets\.AZURE_CLIENT_ID \}\}'/);
  assert.match(workflow, /tenant-id: '\$\{\{ secrets\.AZURE_TENANT_ID \}\}'/);
  assert.match(workflow, /subscription-id: '\$\{\{ secrets\.AZURE_SUBSCRIPTION_ID \}\}'/);
  assert.match(workflow, /TRUYN_D200_LOCATION: '\$\{\{ env\.TRUYN_D500_LOCATION \}\}'/);
  assert.match(workflow, /bash scripts\/d200-stage-runtime-bundle\.sh/);
  assert.match(workflow, /source scripts\/d200-stage-isolated-campaign\.sh/);
  assert.match(workflow, /TRUYN_CLASS_D1000_NODES_PER_HOST="\$NODES_PER_HOST"/);
  assert.match(workflow, /\.topology\.nodeCount==500/);
  assert.match(workflow, /\.topology\.realProcessesPerHost==25/);
  assert.match(workflow, /\.recovery\.restartedNodeCount==100/);
  assert.match(workflow, /TRUYN_D500_TERMINAL result=\$result/);
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

test('D-500 attempt-2 token template is incomplete by construction until exact qualification', () => {
  if (!fs.existsSync('.github/d500/launch-01.txt')) return;
  const token = fs.readFileSync('.github/d500/launch-02.template.txt', 'utf8');
  assert.match(token, /TASK_ID=truyn-d500-acceptance-260920-a2/);
  assert.match(token, /REFERENCE_D200_RUN=35503894414/);
  assert.match(token, /REFERENCE_D200_REPEATABILITY_RUN=35517248924/);
  assert.match(token, /WORKFLOW_BLOB_SHA=__WORKFLOW_BLOB_SHA__/);
  assert.equal(fs.existsSync('.github/d500/launch-02.txt'), false);
});

test('accepted D-200 evidence remains authoritative and explicitly does not claim D-500', () => {
  const report = fs.readFileSync('docs/benchmarks/CLASS_D_200_2026-09-20.md', 'utf8');
  assert.match(report, /35503894414/);
  assert.match(report, /TRUYN_D200_TERMINAL result=PASS/);
  assert.match(report, /does \*\*not\*\* claim Class D-500/);
});
