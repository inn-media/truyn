import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validate, D500_TOPOLOGY } from '../scripts/check-d500-contract.mjs';

const d200 = JSON.parse(fs.readFileSync('config/d200-contract.json', 'utf8'));
const d500 = JSON.parse(fs.readFileSync('config/d500-contract.json', 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const phase = process.env.D500_PREFLIGHT_PHASE || 'prepare';

function mustReject(mutator, match) {
  const candidate = clone(d500);
  mutator(candidate);
  assert.throws(() => validate(candidate), match);
}

test('D-500 canonical contract is exactly 20 hosts x 25 real processes = 500', () => {
  assert.equal(validate(d500), true);
  assert.deepEqual(
    {
      hostsRequired: d500.hostsRequired,
      processTarget: d500.processTarget,
      nodesPerHost: d500.nodesPerHost,
      restartNodesPerHostRequired: d500.restartNodesPerHostRequired,
      restartNodeTarget: d500.restartNodeTarget,
    },
    D500_TOPOLOGY,
  );
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

test('D-500 workflow surface is phase-locked', () => {
  const names = fs.readdirSync('.github/workflows');
  const active = names.filter((name) => /^d-?500.*\.ya?ml$/i.test(name)).sort();
  assert.equal(fs.existsSync('.github/d500/launch-01.txt'), false);
  if (phase === 'launch') assert.deepEqual(active, ['d500-acceptance.yml']);
  else assert.deepEqual(active, []);
  assert.equal(fs.existsSync('.github/d500/d500-acceptance.template.yml'), true);
  assert.equal(fs.existsSync('.github/d500/launch-01.template.txt'), true);
});

test('D-500 launcher template inherits immutable qualification and strict terminal semantics', () => {
  const template = fs.readFileSync('.github/d500/d500-acceptance.template.yml', 'utf8');
  assert.match(template, /REFERENCE_D200_RUN: '35503894414'/);
  assert.match(template, /REFERENCE_D200_REPEATABILITY_RUN: '__D200_REPEATABILITY_ACCEPTED_RUN__'/);
  assert.match(template, /TESTED_COMMIT: __TESTED_COMMIT__/);
  assert.match(template, /TESTED_TREE_SHA: __TESTED_TREE_SHA__/);
  assert.match(template, /EXACT_MAIN_CI_RUN: '__EXACT_MAIN_CI_RUN__'/);
  assert.match(template, /EXACT_MAIN_FIVE_PATCH_RUN: '__EXACT_MAIN_FIVE_PATCH_RUN__'/);
  assert.match(template, /QUALIFIED_TREE_CODEQL_CHECK: '__QUALIFIED_TREE_CODEQL_CHECK__'/);
  assert.match(template, /D500_CONTRACT_SHA256: __D500_CONTRACT_SHA256__/);
  assert.match(template, /NODES_PER_HOST: '25'/);
  assert.match(template, /D500_PREFLIGHT_PHASE=launch bash scripts\/class-d-500-preflight-qualification\.sh/);
  assert.match(template, /TRUYN_CLASS_D1000_NODES_PER_HOST="\$NODES_PER_HOST"/);
  assert.match(template, /\.topology\.nodeCount==500/);
  assert.match(template, /\.topology\.realProcessesPerHost==25/);
  assert.match(template, /\.recovery\.restartedNodeCount==100/);
  assert.match(template, /TRUYN_D500_TERMINAL result=\$result/);
  assert.match(template, /staging_cleanup/);
});

test('D-500 launch token template is incomplete by construction until final qualification', () => {
  const token = fs.readFileSync('.github/d500/launch-01.template.txt', 'utf8');
  for (const placeholder of [
    '__D200_REPEATABILITY_ACCEPTED_RUN__',
    '__TESTED_COMMIT__',
    '__TESTED_TREE_SHA__',
    '__EXACT_MAIN_CI_RUN__',
    '__EXACT_MAIN_FIVE_PATCH_RUN__',
    '__QUALIFIED_TREE_CODEQL_CHECK__',
    '__QUALIFIED_TREE_CODEQL_SHA__',
    '__D500_CONTRACT_SHA256__',
    '__WORKFLOW_BLOB_SHA__',
  ]) assert.match(token, new RegExp(placeholder));
  assert.match(token, /REFERENCE_D200_RUN=35503894414/);
});

test('accepted D-200 evidence remains authoritative and explicitly does not claim D-500', () => {
  const report = fs.readFileSync('docs/benchmarks/CLASS_D_200_2026-09-20.md', 'utf8');
  assert.match(report, /35503894414/);
  assert.match(report, /TRUYN_D200_TERMINAL result=PASS/);
  assert.match(report, /does \*\*not\*\* claim Class D-500/);
});
