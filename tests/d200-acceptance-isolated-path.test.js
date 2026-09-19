import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('D-200 real acceptance executes stage-isolated campaign, never direct fail-fast campaign', async () => {
  const workflow = await read('.github/workflows/d200-acceptance.yml');
  assert.match(workflow, /source benchmarks\/scale\/class-d-azure-1000-provision\.sh; source scripts\/d200-stage-isolated-campaign\.sh/);
  assert.doesNotMatch(workflow, /source benchmarks\/scale\/class-d-azure-1000-provision\.sh; source benchmarks\/scale\/class-d-azure-1000-campaign\.sh/);
  assert.match(workflow, /continue-on-error: true/);
  assert.match(workflow, /if: always\(\)/);
});

test('D-200 acceptance stays fail-closed after stage isolation', async () => {
  const workflow = await read('.github/workflows/d200-acceptance.yml');
  assert.match(workflow, /CAMPAIGN_RC:-99[^\n]*== 0/);
  assert.match(workflow, /EVALUATOR_RC:-99[^\n]*== 0/);
  assert.match(workflow, /result=FAIL/);
  assert.match(workflow, /TRUYN_D200_TERMINAL result=\$result/);
});

test('D-200 next placement prefers 4-vCPU hosts before 2-vCPU fallback', async () => {
  const workflow = await read('.github/workflows/d200-acceptance.yml');
  assert.match(workflow, /for z in Standard_D4as_v5 Standard_D4s_v5 Standard_E2as_v7/);
});

test('restart logical RED is evidence, not an Azure RunCommand replay trigger', async () => {
  const restart = await read('benchmarks/scale/d200-restart-recovery-stage.sh');
  assert.match(restart, /RESTART_LOGICAL_RC=/);
  assert.match(restart, /class-d-200-restart-recovery-hosts\.json/);
  assert.match(restart, /class-d-200-restart-recovery-host-output\.log/);
  assert.match(restart, /exit 0\nEOS/);
  assert.match(restart, /if \[\[ "\$\(marker "\$out" READY\)" == "\$NODES_PER_HOST" \]\]/);
});
