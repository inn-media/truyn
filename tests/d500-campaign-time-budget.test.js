import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const provisionSource = await readFile('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');
const campaignSource = await readFile('benchmarks/scale/class-d-azure-1000-campaign.sh', 'utf8');
const stageRunnerSource = await readFile('scripts/d200-stage-isolated-campaign.sh', 'utf8');
const workflow = await readFile('.github/workflows/d500-acceptance.yml', 'utf8');
const template = await readFile('.github/d500/d500-acceptance.template.yml', 'utf8');

function shellFunction(source, name) {
  const match = source.match(new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}`, 'm'));
  assert.ok(match, `${name}() must exist`);
  return match[0];
}

async function withAzStub(mode, run) {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d500-budget-'));
  try {
    await writeFile(join(dir, 'az'), `#!/usr/bin/env bash\n${mode}\n`);
    await chmod(join(dir, 'az'), 0o755);
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runRemote(dir, env, script) {
  const harness = [
    shellFunction(provisionSource, 'd500_seconds_remaining'),
    shellFunction(provisionSource, 'remote'),
    'sleep() { :; }',
    'RG=rg',
    script,
  ].join('\n');
  return spawnSync('bash', ['-c', harness], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, ...env },
  });
}

test('a hung Azure control plane is bounded by a client-side timeout, not the 90-minute extension timeout', async () => {
  await withAzStub('sleep 120', async (dir) => {
    const started = Date.now();
    const run = runRemote(dir, { REMOTE_TIMEOUT_S: '2', TRUYN_D500_REMOTE_ATTEMPTS: '3' }, 'remote vm-h0 true; echo "RC=$?"');
    const elapsedMs = Date.now() - started;
    assert.match(run.stdout, /RC=70/, `stdout=${run.stdout} stderr=${run.stderr}`);
    assert.match(run.stderr, /TRUYN_D500_REMOTE_TIMEOUT vm=vm-h0 attempt=1 capS=2/);
    assert.match(run.stderr, /TRUYN_D500_HOST_UNHEALTHY vm=vm-h0 rc=124 attempts=2 reason=vm_agent_unreachable/);
    assert.ok(elapsedMs < 60_000, `remote must give up fast, took ${elapsedMs}ms`);
  });
});

test('an unreachable VM agent fails the host after two attempts instead of retrying for hours', async () => {
  await withAzStub('echo "ERROR: (VMAgentStatusCommunicationError) agent unreachable" >&2; exit 1', async (dir) => {
    const run = runRemote(dir, { TRUYN_D500_REMOTE_ATTEMPTS: '5' }, 'remote vm-h14 true; echo "RC=$?"');
    assert.match(run.stdout, /RC=70/);
    assert.match(run.stderr, /TRUYN_D500_VM_AGENT_PATHOLOGY vm=vm-h14 attempt=1/);
    assert.doesNotMatch(run.stderr, /attempt=3/);
  });
});

test('remote refuses to start work once the campaign budget is spent', async () => {
  await withAzStub('echo OK_MARKER=1', async (dir) => {
    const run = runRemote(dir, { TRUYN_D500_DEADLINE_EPOCH: '1' }, 'remote vm-h0 true; echo "RC=$?"');
    assert.match(run.stdout, /RC=75/);
    assert.match(run.stderr, /TRUYN_D500_REMOTE_ABORT vm=vm-h0 reason=campaign_budget_exhausted/);
  });
});

test('a transient run-command failure is still retried under an inherited ERR trap', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d500-transient-'));
  try {
    await writeFile(join(dir, 'az'), '#!/usr/bin/env bash\nif [[ ! -f "$STATE/failed" ]]; then touch "$STATE/failed"; echo "ERROR: (Conflict) run command busy" >&2; exit 1; fi\necho OK_MARKER=1\n');
    await chmod(join(dir, 'az'), 0o755);
    const harness = [
      shellFunction(provisionSource, 'd500_seconds_remaining'),
      shellFunction(provisionSource, 'remote'),
      'sleep() { :; }',
      'RG=rg',
      `( trap 'exit 97' ERR; set -Eeuo pipefail; (remote vm-h0 'true' >"${dir}/out") & wait $! || { echo BACKGROUND_REMOTE_KILLED; exit 1; }; grep -q OK_MARKER=1 "${dir}/out"; echo STAGE_OK )`,
    ].join('\n');
    const run = spawnSync('bash', ['-c', harness], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, STATE: dir },
    });
    assert.match(run.stdout, /STAGE_OK/, `stdout=${run.stdout} stderr=${run.stderr}`);
    assert.doesNotMatch(run.stdout, /BACKGROUND_REMOTE_KILLED/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the stage watchdog terminates an overrunning stage and preserves its partial state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d500-watchdog-'));
  try {
    const harness = [
      'set -uo pipefail',
      shellFunction(stageRunnerSource, 'd200_campaign_seconds_remaining'),
      shellFunction(stageRunnerSource, 'd200_stage_budget'),
      shellFunction(stageRunnerSource, 'd200_kill_tree'),
      shellFunction(stageRunnerSource, 'd200_stage_watchdog'),
      'D200_STAGE_BUDGET_DEFAULT_S=600',
      'D200_EVIDENCE_RESERVE_S=0',
      'declare -A D200_STAGE_BUDGETS=([hung]=3)',
      'TRUYN_D500_STAGE_KILL_GRACE_S=2',
      `failure_file=${dir}/failure.txt; deadline_file=${dir}/deadline.txt; state_file=${dir}/state.sh`,
      'budget=$(d200_stage_budget hung)',
      '(',
      "  trap - ERR EXIT",
      '  d200_stage_failure_file="$failure_file"',
      `  trap 'printf "rc=124\\n" >"$d200_stage_failure_file"; exit 124' TERM`,
      `  trap 'rc=$?; trap - EXIT; echo "healed_rate=0.5" >"${dir}/state.sh"; exit "$rc"' EXIT`,
      '  set -Eeuo pipefail',
      '  sleep 600',
      ') & stage_pid=$!',
      'd200_stage_watchdog "$stage_pid" "$budget" hung "$deadline_file" & watchdog_pid=$!',
      'wait "$stage_pid"; rc=$?',
      'd200_kill_tree "$watchdog_pid" TERM; wait "$watchdog_pid" 2>/dev/null',
      'echo "STAGE_RC=$rc"',
      'echo "DEADLINE=$(cat "$deadline_file")"',
      'echo "STATE=$(cat "$state_file")"',
    ].join('\n');
    const started = Date.now();
    const run = spawnSync('bash', ['-c', harness], { encoding: 'utf8' });
    const elapsedMs = Date.now() - started;
    assert.match(run.stdout, /STAGE_RC=124/, `stdout=${run.stdout} stderr=${run.stderr}`);
    assert.match(run.stdout, /DEADLINE=stage_deadline_exceeded budgetS=3/);
    assert.match(run.stdout, /STATE=healed_rate=0\.5/);
    assert.match(run.stderr, /TRUYN_D500_STAGE_DEADLINE stage=hung budgetS=3 action=terminate/);
    assert.ok(elapsedMs < 60_000, `watchdog must fire at the budget, took ${elapsedMs}ms`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('stage budgets never exceed what is left of the campaign budget', () => {
  const harness = [
    'set -uo pipefail',
    shellFunction(stageRunnerSource, 'd200_campaign_seconds_remaining'),
    shellFunction(stageRunnerSource, 'd200_stage_budget'),
    'D200_STAGE_BUDGET_DEFAULT_S=900',
    'D200_EVIDENCE_RESERVE_S=240',
    'declare -A D200_STAGE_BUDGETS=([healed-routing]=1200)',
    'TRUYN_D500_DEADLINE_EPOCH=$(( $(date +%s) + 600 ))',
    'echo "CLAMPED=$(d200_stage_budget healed-routing)"',
    'TRUYN_D500_DEADLINE_EPOCH=$(( $(date +%s) + 100 ))',
    'echo "EXHAUSTED=$(d200_stage_budget healed-routing)"',
  ].join('\n');
  const run = spawnSync('bash', ['-c', harness], { encoding: 'utf8' });
  const clamped = Number(run.stdout.match(/CLAMPED=(\d+)/)?.[1]);
  const exhausted = Number(run.stdout.match(/EXHAUSTED=(-?\d+)/)?.[1]);
  assert.ok(clamped > 300 && clamped <= 360, `clamped=${clamped} stdout=${run.stdout}`);
  assert.ok(exhausted >= 0 && exhausted <= 60, `exhausted=${exhausted}`);
});

test('the long per-host stages dispatch all 20 hosts concurrently', () => {
  assert.match(provisionSource, /\)\s*>"\$provision_dir\/\$i\.log" &/);
  assert.match(provisionSource, /\)\s*>"\$install_dir\/\$i" &/);
  assert.match(campaignSource, /\)\s*>"\$healed_out_dir\/\$i" &/);
  // The healed stage must read each host's captured output instead of blocking
  // on one remote call per host in sequence.
  assert.match(campaignSource, /out="\$\(cat "\$healed_out_dir\/\$i"\)"/);
  assert.match(provisionSource, /install_pids\+=\("\$!"\)/);
  assert.match(provisionSource, /provision_pids\+=\("\$!"\)/);
  assert.match(campaignSource, /healed_pids\+=\("\$!"\)/);
  // Every fan-out must be collected host by host so one failure cannot hide the
  // other hosts' evidence behind an early exit on the first failed wait.
  for (const [source, pids] of [
    [provisionSource, 'provision_pids'],
    [provisionSource, 'install_pids'],
    [provisionSource, 'bootstrap_pids'],
    [campaignSource, 'healed_pids'],
  ]) {
    assert.match(source, new RegExp(`if ! wait "\\$\\{${pids}\\[\\$i\\]}"`), `${pids} must be waited per host`);
  }
});

test('the D-500 workflow and its launcher template bound the job inside the runner cap', () => {
  for (const [name, source] of [['workflow', workflow], ['template', template]]) {
    assert.match(source, /timeout-minutes: 180/, `${name} must not claim more than the runner allows`);
    assert.doesNotMatch(source, /timeout-minutes: 420/, `${name} must drop the unreachable 7h timeout`);
    assert.match(source, /TRUYN_D500_BUDGET_S: '9000'/, `${name} must pin the campaign budget`);
    assert.match(source, /TRUYN_D500_BUDGET_S="\$TRUYN_D500_BUDGET_S"/, `${name} must pass the budget to the campaign`);
    assert.match(source, /class-d-1000-partial-evidence-from-log\.js class-d-500-diagnostic\.log class-d-500-partial-evidence\.json/, `${name} must keep diagnostic evidence for a timed-out run`);
    assert.match(source, /class-d-500-stage-timing\.txt/, `${name} must retain per-stage timing`);
    // The strict gate must keep reading only the canonical evidence file.
    assert.match(source, /jq -e '\.topology\.hostCount==20/, `${name} must not weaken the strict gate`);
    assert.doesNotMatch(source, /partial-evidence[^\n]*class-d-1000-evidence\.json/, `${name} must never feed partial evidence to the evaluator`);
  }
});
