import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const normalizePreparedTemplate = (source) => source.replace(/\\+"/g, '"');

// Structural guard for the prepared D-1000 runner: convergence must remain a
// hard gate, but the ERR trap must still materialize evidence before the EXIT
// cleanup trap mutates cleanup fields.
test('D-1000 final acceptance prepares FAIL evidence before cleanup trap mutation', async () => {
  const launcher = normalizePreparedTemplate(
    await readFile('scripts/class-d-1000-final-acceptance.sh', 'utf8')
  );

  assert.match(launcher, /finalize_failure_evidence\(\) \{/);
  assert.match(launcher, /"status": "FAIL"/);
  assert.match(launcher, /"evidenceFinalizedOnFail": True/);
  assert.match(launcher, /TRUYN_FAIL_STAGE="\$failed_stage"/);
  assert.match(launcher, /TRUYN_CONV_RATE="\$\{conv_rate:-\}"/);
  assert.match(launcher, /TRUYN_CONV_P95="\$\{conv_p95:-\}"/);
  assert.match(launcher, /finalize_failure_evidence "\$rc" "\$failed_stage" "\$failed_line"/);
  assert.match(launcher, /\.cleanup\.finalizedAfterExitTrap=\$after_exit_trap/);

  const finalizerIndex = launcher.indexOf('finalize_failure_evidence() {');
  const trapIndex = launcher.indexOf('finalize_failure_evidence "$rc" "$failed_stage" "$failed_line"');
  const cleanupIndex = launcher.indexOf('.cleanup.finalizedAfterExitTrap=$after_exit_trap');

  assert.ok(finalizerIndex >= 0, 'expected fail evidence finalizer');
  assert.ok(trapIndex > finalizerIndex, 'ERR trap must call the finalizer prepared earlier');
  assert.ok(cleanupIndex > finalizerIndex, 'cleanup patch must run against the file created by the finalizer');
});

test('D-1000 convergence fail remains a hard FAIL, but evidence can still be written', async () => {
  const campaign = await readFile('benchmarks/scale/class-d-azure-1000-campaign.sh', 'utf8');
  const launcher = normalizePreparedTemplate(
    await readFile('scripts/class-d-1000-final-acceptance.sh', 'utf8')
  );

  const convergenceIndex = campaign.indexOf('STAGE=convergence');
  const successEvidenceIndex = campaign.indexOf('STAGE=evidence');
  const rateGateIndex = campaign.indexOf("assert float('$conv_rate') >= .99");
  const latencyGateIndex = campaign.indexOf("assert float('$conv_p95') <= 120000");

  assert.ok(convergenceIndex >= 0, 'expected convergence stage');
  assert.ok(successEvidenceIndex > convergenceIndex, 'expected success evidence after convergence');
  assert.ok(rateGateIndex > convergenceIndex && rateGateIndex < successEvidenceIndex, 'routing threshold stays before success evidence');
  assert.ok(latencyGateIndex > convergenceIndex && latencyGateIndex < successEvidenceIndex, 'p95 threshold stays before success evidence');
  assert.match(launcher, /"convergence": \{/);
  assert.match(launcher, /"probeMode": "parallel-host-fanout"/);
  assert.match(launcher, /"routingSuccessRatio": number\('TRUYN_CONV_RATE'\)/);
});