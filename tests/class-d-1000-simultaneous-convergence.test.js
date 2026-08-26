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

  assert.match(block, /conv_dir=\$\(mktemp -d\)/);
  assert.match(block, /conv_pids=\(\)/);
  assert.match(block, /for i in \$\(seq 0 \$\(\(HOST_COUNT-1\)\)\); do/);
  assert.match(block, /\(remote "\$\{VMS\[\$i\]\}" "\$script" >"\$conv_dir\/\$i"\) &/);
  assert.match(block, /conv_pids\+=\("\$!"\)/);
  assert.match(block, /for pid in "\$\{conv_pids\[@\]\}"; do wait "\$pid"; done/);
  assert.match(block, /out="\$\(cat "\$conv_dir\/\$i"\)"/);
  assert.match(block, /stage=convergence mode=parallel-hosts hosts=\$\{HOST_COUNT\}/);
  assert.match(block, /aggregateMs=\$\{conv_ms\}/);
  assert.match(campaign, /"convergence":\{"probeMode":"parallel-host-fanout"/);
  assert.match(campaign, /"aggregation":"max-of-host-quantiles"/);

  const launchIndex = block.indexOf('(remote "${VMS[$i]}" "$script" >"$conv_dir/$i") &');
  const waitIndex = block.indexOf('for pid in "${conv_pids[@]}"; do wait "$pid"; done');
  const aggregateIndex = block.indexOf('out="$(cat "$conv_dir/$i")"');

  assert.ok(launchIndex >= 0, 'expected background launch');
  assert.ok(waitIndex > launchIndex, 'expected wait after all background launches');
  assert.ok(aggregateIndex > waitIndex, 'expected aggregation only after wait');
  assert.doesNotMatch(block.slice(0, waitIndex), /out=\$\(remote "\$\{VMS\[\$i\]\}" "\$script"\)/);
});
