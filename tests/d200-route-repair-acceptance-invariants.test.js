import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('D-200 route repair preserves canonical routing, recovery, and write-loss acceptance gates', async () => {
  const campaign = await readFile('benchmarks/scale/class-d-azure-1000-campaign.sh', 'utf8');

  assert.ok(campaign.includes("assert float('$base_rate') >= .99, '$base_rate'"), 'baseline routing threshold must remain >=99%');
  assert.ok(campaign.includes("assert float('$post_rate') >= .99, '$post_rate'"), 'post-restart routing threshold must remain >=99%');
  assert.ok(campaign.includes("assert float('$healed_rate') >= .99, '$healed_rate'"), 'healed routing threshold must remain >=99%');
  assert.ok(campaign.includes("assert float('$recovery_p95') <= 120000, '$recovery_p95'"), 'restart recovery p95 limit must remain 120000ms');
  assert.ok(campaign.includes('[[ "$partition_recovery_ms" -le 120000 ]]'), 'partition recovery limit must remain 120000ms');
  assert.ok(campaign.includes('[[ "$writes" == 100 ]]'), 'acknowledged durable write requirement must remain exactly 100');
  assert.ok(campaign.includes('ack_loss=$((writes-retained))'), 'acknowledged write loss must be measured from retained writes');
  assert.ok(campaign.includes('[[ "$ack_loss" == 0 ]]'), 'acknowledged write loss requirement must remain exactly zero');

  const baselineStart = campaign.indexOf('STAGE=baseline-routing');
  const baselineEnd = campaign.indexOf('STAGE=invalid-signed-state', baselineStart);
  assert.ok(baselineStart >= 0 && baselineEnd > baselineStart, 'baseline stage boundaries must exist');
  const baseline = campaign.slice(baselineStart, baselineEnd);
  assert.ok(baseline.includes("'--max-time','15'"), 'external baseline request timeout must remain 15 seconds');
  assert.ok(baseline.includes('D200_BASELINE_PRODUCTION_RECOVERY=1'), 'accepted bounded production recovery must be canonical');
  assert.ok(baseline.includes("'targetCount':32"), 'production recovery must retain maxPeers=32');
  assert.ok(baseline.includes("'maxRounds':2"), 'production refresh must remain bounded to two rounds');
  assert.ok(baseline.includes("retry=attempt('recovered')"), 'one recovered NEED attempt must remain available after first-attempt failure');
  assert.equal((baseline.match(/retry=attempt\('recovered'\)/g) || []).length, 1, 'baseline production recovery must permit exactly one recovered NEED attempt');
  assert.ok(baseline.includes('Separate diagnostic retries later in this stage remain evidence-only'), 'diagnostic retries must remain excluded from baseline acceptance');
});
