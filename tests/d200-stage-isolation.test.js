import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve(new URL('..', import.meta.url).pathname);

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function fixtureShell({ root, campaign, evidence }) {
  return `
set -Eeuo pipefail
cd '${repo}'
export GITHUB_WORKSPACE='${root}'
export D200_CAMPAIGN_SOURCE='${campaign}'
export D200_RESTART_STAGE_SOURCE='${root}/no-restart-override.sh'
HOST_COUNT=1
NODES_PER_HOST=1
NODE_COUNT=1
EVIDENCE='${evidence}'
QUIC_BASE=4400
CONTROL_BASE=8700
VMS=(fixture-vm)
PRIV=(10.0.0.1 10.0.0.2)
remote(){ return 0; }
marker(){ local text="$1" key="$2"; printf '%s\\n' "$text" | sed -n "s/.*\${key}=//p" | tail -1 | tr -d '\\r'; }
d200_failure_evidence_checkpoint(){ printf '{"failure":{"stage":"%s","exitCode":%s,"line":%s,"evidenceComplete":false},"resources":{"aggregateNodeRssKb":%s,"measuredQuicUdpBytes":%s,"observedNodeProcesses":%s},"cleanup":{"confirmed":false,"remainingResources":null}}\\n' "$2" "$1" "$3" "\${rss_kb:-null}" "\${quic_bytes:-null}" "\${process_total:-null}" >"$EVIDENCE"; }
d200_err_trap(){ exit "\${1:-1}"; }
source scripts/d200-stage-isolated-campaign.sh
`;
}

test('D-200 stage isolation continues independent stages, skips invalid dependencies, rebuilds partial evidence, and returns FAIL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-d200-stage-isolation-'));
  const campaign = join(root, 'fixture-campaign.sh');
  const betaMarker = join(root, 'beta-ran');
  const retentionMarker = join(root, 'retention-ran');
  const evidence = join(root, 'class-d-1000-evidence.json');
  try {
    await writeFile(campaign, `STAGE=topology\necho TOPOLOGY_FIXTURE\n\nSTAGE=alpha\necho ALPHA_START\nfalse\n\nSTAGE=beta\nprintf yes >'${betaMarker}'\n\nSTAGE=durable-writes\nwrites=0\nprintf '{"failure":{"stage":"durable-writes","evidenceComplete":false},"cleanup":{"confirmed":false,"remainingResources":null}}\\n' >"$EVIDENCE"\nfalse\n\nSTAGE=restart-recovery\necho RESTART_FIXTURE\n\nSTAGE=post-restart-routing\necho POST_RESTART_FIXTURE\n\nSTAGE=packet-partition\necho PARTITION_FIXTURE\n\nSTAGE=healed-routing\necho HEALED_FIXTURE\n\nSTAGE=write-retention\nprintf bad >'${retentionMarker}'\n\nSTAGE=resources\nrss_kb=123\nquic_bytes=456\nprocess_total=1\n\nSTAGE=evidence\nprintf '{"unexpected":true}\\n' >"$EVIDENCE"\n`);

    const run = spawnSync('bash', ['-c', fixtureShell({ root, campaign, evidence })], { encoding: 'utf8' });
    assert.notEqual(run.status, 0, `campaign must remain fail-closed\nstdout=${run.stdout}\nstderr=${run.stderr}`);
    assert.equal(await exists(betaMarker), true, 'independent beta stage must run after alpha RED');
    assert.equal(await exists(retentionMarker), false, 'write-retention must be skipped when durable-writes is RED');
    assert.equal(await exists(join(root, 'class-d-200-intermediate-failure-evidence.json')), true, 'stage-local checkpoint must be retained separately');

    const results = JSON.parse(await readFile(join(root, 'class-d-200-stage-results.json'), 'utf8'));
    const byStage = Object.fromEntries(results.stages.map((row) => [row.stage, row]));
    assert.equal(results.overall, 'FAIL');
    assert.equal(results.acceptanceWeakened, false);
    assert.equal(results.allPossibleStagesAttempted, true);
    assert.equal(byStage.topology.status, 'PASS');
    assert.equal(byStage.alpha.status, 'RED');
    assert.equal(byStage.beta.status, 'PASS');
    assert.equal(byStage['durable-writes'].status, 'RED');
    assert.equal(byStage['restart-recovery'].status, 'PASS');
    assert.equal(byStage['post-restart-routing'].status, 'PASS');
    assert.equal(byStage['packet-partition'].status, 'PASS');
    assert.equal(byStage['healed-routing'].status, 'PASS');
    assert.equal(byStage['write-retention'].status, 'SKIPPED_DEPENDENCY');
    assert.equal(byStage.resources.status, 'PASS');
    assert.equal(byStage.evidence.status, 'SKIPPED_DEPENDENCY');

    const intermediate = JSON.parse(await readFile(join(root, 'class-d-200-intermediate-failure-evidence.json'), 'utf8'));
    assert.equal(intermediate.failure.stage, 'durable-writes');

    const partial = JSON.parse(await readFile(evidence, 'utf8'));
    assert.equal(partial.failure.stage, 'alpha', 'first real failure must remain the durable failure anchor');
    assert.equal(partial.failure.diagnosticPassComplete, true);
    assert.equal(partial.stageResults.overall, 'FAIL');
    assert.equal(partial.resources.aggregateNodeRssKb, 123, 'later successful stage metrics must survive final partial evidence rebuild');
    assert.equal(partial.resources.measuredQuicUdpBytes, 456);
    assert.equal(partial.resources.observedNodeProcesses, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('malformed stage plan is fail-closed instead of silently succeeding', async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-d200-stage-plan-'));
  const campaign = join(root, 'fixture-campaign.sh');
  const evidence = join(root, 'class-d-1000-evidence.json');
  try {
    await writeFile(campaign, 'STAGE=baseline-routing\necho BASELINE_ONLY\n');
    const run = spawnSync('bash', ['-c', fixtureShell({ root, campaign, evidence })], { encoding: 'utf8' });
    assert.notEqual(run.status, 0, `missing required stages must fail closed\nstdout=${run.stdout}\nstderr=${run.stderr}`);
    const results = JSON.parse(await readFile(join(root, 'class-d-200-stage-results.json'), 'utf8'));
    assert.equal(results.overall, 'FAIL');
    assert.ok(results.stages.some((row) => row.stage === 'stage-plan' && row.status === 'RED'));
    const partial = JSON.parse(await readFile(evidence, 'utf8'));
    assert.equal(partial.failure.stage, 'stage-plan');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('restart recovery parses exact markers and compares READY with the five restarted nodes', async () => {
  const source = await readFile(join(repo, 'benchmarks/scale/d200-restart-recovery-stage.sh'), 'utf8');
  assert.match(source, /d200_restart_exact_marker\(\)/);
  assert.match(source, /sed -n "s\/\^\$\{key\}=\/\/p"/);
  assert.match(source, /restarted_nodes_per_host=\$\(\(restart_last_node-restart_first_node\+1\)\)/);
  assert.match(source, /if \[\[ "\$ready" == "\$restarted_nodes_per_host" \]\]/);
  assert.doesNotMatch(source, /(?:^|\s)marker "\$out" READY/m);
  assert.match(source, /RESTART_LOGICAL_RC=/);
  assert.match(source, /TRUYN_D200_RESTART_HOST_FAILURE/);
  assert.match(source, /class-d-200-restart-recovery-hosts\.json/);
  assert.match(source, /remoteRc=/);
  assert.match(source, /lastBadNode=/);
  assert.match(source, /exit 0\nEOS/, 'logical remote failure must not trigger remote\(\) retry/restart repetition');
});

test('stage-isolated plan explicitly requires topology', async () => {
  const source = await readFile(join(repo, 'scripts/d200-stage-isolated-campaign.sh'), 'utf8');
  assert.match(source, /for required_stage in topology restart-recovery post-restart-routing packet-partition healed-routing resources evidence/);
});

test('acceptance remains strict: campaign rc and evaluator rc must both be zero for PASS', async () => {
  const workflow = await readFile(join(repo, '.github/workflows/d200-acceptance.yml'), 'utf8');
  assert.match(workflow, /CAMPAIGN_RC:-99[^\n]*== 0/);
  assert.match(workflow, /EVALUATOR_RC:-99[^\n]*== 0/);
  assert.match(workflow, /result=FAIL/);
  assert.match(workflow, /TRUYN_D200_TERMINAL result=\$result/);
});
