import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('D-1000 convergence probes fan out to all hosts before aggregation', async () => {
  const campaign = await readFile('benchmarks/scale/class-d-azure-1000-campaign.sh', 'utf8');
  const convergenceStart = campaign.indexOf('STAGE=convergence');
  const baselineStart = campaign.indexOf('STAGE=baseline-routing');

  assert.ok(convergenceStart >= 0, 'expected convergence stage');
  assert.ok(baselineStart > convergenceStart, 'expected baseline after convergence');

  const block = campaign.slice(convergenceStart, baselineStart);

  const launchLine = '(remote "${VMS[$i]}" "$script" >"$conv_dir/$i") &';
  const waitLine = 'for pid in "${conv_pids[@]}"; do wait "$pid"; done';
  const aggregateLine = 'out="$(cat "$conv_dir/$i")"';

  assert.ok(block.includes('conv_dir=$(mktemp -d)'), 'expected temp directory for host outputs');
  assert.ok(block.includes('conv_pids=()'), 'expected PID collection');
  assert.ok(block.includes('for i in $(seq 0 $((HOST_COUNT-1))); do'), 'expected host fan-out loop');
  assert.ok(block.includes(launchLine), 'expected background remote launch per host');
  assert.ok(block.includes('conv_pids+=("$!")'), 'expected PID capture');
  assert.ok(block.includes(waitLine), 'expected wait after fan-out');
  assert.ok(block.includes(aggregateLine), 'expected file-backed aggregation');
  assert.ok(block.includes('stage=convergence host=$i mode=parallel-hosts'), 'expected per-host parallel mode log');
  assert.ok(block.includes('stage=convergence mode=parallel-hosts hosts=${HOST_COUNT}'), 'expected aggregate parallel mode log');
  assert.ok(block.includes('aggregateMs=${conv_ms}'), 'expected aggregate wall-clock metric');
  assert.ok(campaign.includes('"convergence":{"probeMode":"parallel-host-fanout"'), 'expected evidence probe mode');
  assert.ok(campaign.includes('"aggregation":"max-of-host-quantiles"'), 'expected unchanged aggregation semantics');

  const launchIndex = block.indexOf(launchLine);
  const waitIndex = block.indexOf(waitLine);
  const aggregateIndex = block.indexOf(aggregateLine);

  assert.ok(launchIndex >= 0, 'expected background launch');
  assert.ok(waitIndex > launchIndex, 'expected wait after all background launches');
  assert.ok(aggregateIndex > waitIndex, 'expected aggregation only after wait');
  assert.equal(block.slice(0, waitIndex).includes('out=$(remote "${VMS[$i]}" "$script")'), false);
});
