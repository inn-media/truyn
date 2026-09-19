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

test('D-200 stage isolation continues independent stages, skips invalid dependencies, and returns FAIL', async () => {
  const root = await mkdtemp(join(tmpdir(), 'truyn-d200-stage-isolation-'));
  const campaign = join(root, 'fixture-campaign.sh');
  const betaMarker = join(root, 'beta-ran');
  const retentionMarker = join(root, 'retention-ran');
  const evidence = join(root, 'class-d-1000-evidence.json');
  try {
    await writeFile(campaign, `STAGE=alpha\necho ALPHA_START\nfalse\n\nSTAGE=beta\nprintf yes >'${betaMarker}'\n\nSTAGE=durable-writes\nwrites=0\nfalse\n\nSTAGE=write-retention\nprintf bad >'${retentionMarker}'\n\nSTAGE=evidence\nprintf '{"unexpected":true}\\n' >"$EVIDENCE"\n`);

    const shell = `
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
marker(){ local text="$1" key="$2"; printf '%s\\n' "$text" | sed -n "s/.*${key}=//p" | tail -1 | tr -d '\\r'; }
d200_failure_evidence_checkpoint(){ printf '{"failure":{"stage":"%s","exitCode":%s,"line":%s,"evidenceComplete":false},"cleanup":{"confirmed":false,"remainingResources":null}}\\n' "$2" "$1" "$3" >"$EVIDENCE"; }
d200_err_trap(){ exit "${1:-1}"; }
source scripts/d200-stage-isolated-campaign.sh
`;
    const run = spawnSync('bash', ['-c', shell], { encoding: 'utf8' });
    assert.notEqual(run.status, 0, `campaign must remain fail-closed\nstdout=${run.stdout}\nstderr=${run.stderr}`);
    assert.equal(await exists(betaMarker), true, 'independent beta stage must run after alpha RED');
    assert.equal(await exists(retentionMarker), false, 'write-retention must be skipped when durable-writes is RED');

    const results = JSON.parse(await readFile(join(root, 'class-d-200-stage-results.json'), 'utf8'));
    const byStage = Object.fromEntries(results.stages.map((row) => [row.stage, row]));
    assert.equal(results.overall, 'FAIL');
    assert.equal(results.acceptanceWeakened, false);
    assert.equal(results.allPossibleStagesAttempted, true);
    assert.equal(byStage.alpha.status, 'RED');
    assert.equal(byStage.beta.status, 'PASS');
    assert.equal(byStage['durable-writes'].status, 'RED');
    assert.equal(byStage['write-retention'].status, 'SKIPPED_DEPENDENCY');
    assert.equal(byStage.evidence.status, 'SKIPPED_DEPENDENCY');

    const partial = JSON.parse(await readFile(evidence, 'utf8'));
    assert.equal(partial.failure.stage, 'alpha', 'first real failure must remain the durable failure anchor');
    assert.equal(partial.failure.diagnosticPassComplete, true);
    assert.equal(partial.stageResults.overall, 'FAIL');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('restart recovery override records host evidence before returning RED and keeps READY contract literal', async () => {
  const source = await readFile(join(repo, 'benchmarks/scale/d200-restart-recovery-stage.sh'), 'utf8');
  assert.match(source, /if \[\[ "\$\(marker "\$out" READY\)" == "\$NODES_PER_HOST" \]\]/);
  assert.match(source, /RESTART_LOGICAL_RC=/);
  assert.match(source, /TRUYN_D200_RESTART_HOST_FAILURE/);
  assert.match(source, /class-d-200-restart-recovery-hosts\.json/);
  assert.match(source, /remoteRc=/);
  assert.match(source, /lastBadNode=/);
  assert.match(source, /exit 0\nEOS/, 'logical remote failure must not trigger remote\(\) retry/restart repetition');
});

test('acceptance remains strict: campaign rc and evaluator rc must both be zero for PASS', async () => {
  const workflow = await readFile(join(repo, '.github/workflows/d200-acceptance.yml'), 'utf8');
  assert.match(workflow, /CAMPAIGN_RC:-99[^\n]*== 0/);
  assert.match(workflow, /EVALUATOR_RC:-99[^\n]*== 0/);
  assert.match(workflow, /result=FAIL/);
  assert.match(workflow, /TRUYN_D200_TERMINAL result=\$result/);
});
