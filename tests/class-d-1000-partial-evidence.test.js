import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAzureClassD1000Evidence } from '../benchmarks/scale/class-d-1000-evidence.js';

const fixture = `TRUYN_CLASS_D_1000 stage=topology nodes=1000 identities=1000 sockets=1000 hosts=20 status=PASS
TRUYN_CLASS_D_1000 stage=convergence host=0 success=17/50 p95Ms=141361.028
TRUYN_CLASS_D_1000 stage=convergence host=1 success=20/50 p95Ms=153391.015
TRUYN_CLASS_D_1000 stage=convergence host=2 success=20/50 p95Ms=137759.31
TRUYN_CLASS_D_1000 stage=convergence host=3 success=14/50 p95Ms=153795.788
TRUYN_CLASS_D_1000 stage=convergence host=4 success=19/50 p95Ms=156543.199
TRUYN_CLASS_D_1000 stage=convergence host=5 success=17/50 p95Ms=153692.596
TRUYN_CLASS_D_1000 stage=convergence host=6 success=19/50 p95Ms=144672.876
TRUYN_CLASS_D_1000 stage=convergence host=7 success=19/50 p95Ms=118686.179
TRUYN_CLASS_D_1000 stage=convergence host=8 success=13/50 p95Ms=147278.607
TRUYN_CLASS_D_1000 stage=convergence host=9 success=15/50 p95Ms=54833.424
TRUYN_CLASS_D_1000 stage=convergence host=10 success=13/50 p95Ms=131489.247
TRUYN_CLASS_D_1000 stage=convergence host=11 success=20/50 p95Ms=98788.78
TRUYN_CLASS_D_1000 stage=convergence host=12 success=20/50 p95Ms=91003.433
TRUYN_CLASS_D_1000 stage=convergence host=13 success=17/50 p95Ms=110608.191
TRUYN_CLASS_D_1000 stage=convergence host=14 success=18/50 p95Ms=132149.342
TRUYN_CLASS_D_1000 stage=convergence host=15 success=19/50 p95Ms=168428.945
TRUYN_CLASS_D_1000 stage=convergence host=16 success=23/50 p95Ms=131888.668 p99Ms=156550.744
TRUYN_CLASS_D_1000 stage=convergence host=17 success=17/50 p95Ms=93419.863
TRUYN_CLASS_D_1000 stage=convergence host=18 success=24/50 p95Ms=146537.718 p99Ms=154160.082
TRUYN_CLASS_D_1000 stage=convergence host=19 success=24/50 p95Ms=138232.994 p99Ms=151725.944
TRUYN_CLASS_D_1000_CLEANUP confirmed=true remaining=0
::error title=TRUYN Class D-1000 failure::stage=convergence exit=1 line=54
`;

test('D-1000 strict fallback emits readable partial evidence for convergence failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d1000-partial-'));
  try {
    const logPath = join(dir, 'class-d-1000-strict.log');
    const evidencePath = join(dir, 'class-d-1000-evidence.json');
    await writeFile(logPath, fixture);

    const generated = spawnSync(process.execPath, [
      'benchmarks/scale/class-d-1000-partial-evidence-from-log.js',
      logPath,
      evidencePath,
      '1'
    ], { encoding: 'utf8' });
    assert.equal(generated.status, 0, generated.stderr);

    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
    assert.equal(evidence.partialEvidence, true);
    assert.equal(evidence.acceptanceEligible, false);
    assert.equal(evidence.failure.stage, 'convergence');
    assert.equal(evidence.failure.campaignRc, 1);
    assert.equal(evidence.topology.realProcessCount, 1000);
    assert.equal(evidence.topology.uniqueIdentityCount, 1000);
    assert.equal(evidence.topology.uniqueEndpointCount, 1000);
    assert.equal(evidence.topology.hostCount, 20);
    assert.equal(evidence.cleanup.confirmed, true);
    assert.equal(evidence.cleanup.remainingResources, 0);
    assert.equal(evidence.convergence.successCount, 368);
    assert.equal(evidence.convergence.targetCount, 1000);
    assert.equal(evidence.convergence.successRatio, 0.368);
    assert.equal(evidence.convergence.latencyMs.p95, 168428.945);

    const evaluation = evaluateAzureClassD1000Evidence(evidence);
    assert.equal(evaluation.passed, false);
    assert.ok(evaluation.failed.includes('baselineRouting'));
    assert.ok(evaluation.failed.includes('convergenceP95'));

    const terminal = spawnSync(process.execPath, [
      'benchmarks/scale/verify-class-d-1000-terminal.js',
      evidencePath
    ], { encoding: 'utf8' });
    assert.equal(terminal.status, 1, terminal.stderr);
    const terminalJson = JSON.parse(terminal.stdout);
    assert.equal(terminalJson.ok, false);
    assert.ok(!terminalJson.error);
    assert.ok(terminalJson.failed.includes('canonicalEvaluator'));
    assert.ok(terminalJson.failed.includes('baselineRouting'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
