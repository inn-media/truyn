import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('D-200 source bundle exposes a stable stage-isolated cloud entrypoint', async () => {
  const entrypoint = await read('scripts/d200-execute-isolated-campaign.sh');
  assert.match(entrypoint, /source benchmarks\/scale\/class-d-azure-1000-provision\.sh/);
  assert.match(entrypoint, /source scripts\/d200-stage-isolated-campaign\.sh/);
  assert.doesNotMatch(entrypoint, /source benchmarks\/scale\/class-d-azure-1000-campaign\.sh/);
});

test('frozen launcher remains fail-closed while source repair is qualified separately', async () => {
  const workflow = await read('.github/workflows/d200-acceptance.yml');
  assert.match(workflow, /continue-on-error: true/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /CAMPAIGN_RC:-99[^\n]*== 0/);
  assert.match(workflow, /EVALUATOR_RC:-99[^\n]*== 0/);
  assert.match(workflow, /result=FAIL/);
  assert.match(workflow, /TRUYN_D200_TERMINAL result=\$result/);
});

test('restart logical RED is evidence, not an Azure RunCommand replay trigger', async () => {
  const restart = await read('benchmarks/scale/d200-restart-recovery-stage.sh');
  assert.match(restart, /RESTART_LOGICAL_RC=/);
  assert.match(restart, /class-d-200-restart-recovery-hosts\.json/);
  assert.match(restart, /class-d-200-restart-recovery-host-output\.log/);
  assert.match(restart, /exit 0\nEOS/);
  assert.match(restart, /if \[\[ "\$\(marker "\$out" READY\)" == "\$NODES_PER_HOST" \]\]/);
});
