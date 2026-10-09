import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const campaign = readFileSync('benchmarks/scale/class-d-azure-5000-campaign.sh', 'utf8');
const begin = 'script=$(cat <<EOS\n';
const start = campaign.indexOf(begin, campaign.indexOf('STAGE=readiness-barrier'));
const finish = campaign.indexOf('\nEOS\n)', start + begin.length);
assert.ok(start >= 0 && finish > start, 'readiness heredoc must remain available');
const body = campaign.slice(start + begin.length, finish);

test('readiness heredoc expands under set -u and generated guest script parses', () => {
  const generator = [
    'set -Eeuo pipefail',
    'HOST_COUNT=20',
    'NODES_PER_HOST=250',
    'BOOTSTRAP_MAX_PEERS_PER_NODE=32',
    'CONTROL_BASE=18000',
    'D500_NODE_WORKERS=5',
    'i=0',
    'script=$(cat <<EOS',
    body,
    'EOS',
    ')',
    'printf "%s\\n" "$script"',
  ].join('\n');
  const generated = spawnSync('bash', ['-c', generator], {encoding:'utf8', timeout:30000});
  assert.equal(generated.status, 0, generated.stderr);
  const guest = 'readiness_chunks=$(( ($' + '{#readiness_node_observations_b64} + 2399) / 2400 ))';
  assert.ok(generated.stdout.includes(guest), 'guest-side length expansion must remain literal during controller generation');
  assert.ok(generated.stdout.includes('readiness_node_observations_b64=$('));
  const syntax = spawnSync('bash', ['-n'], {input:generated.stdout, encoding:'utf8'});
  assert.equal(syntax.status, 0, syntax.stderr);
});

test('only reviewed controller variables expand in the readiness heredoc', () => {
  const allowed = new Set(['HOST_COUNT','D500_NODE_WORKERS:-5','CONTROL_BASE','i','BOOTSTRAP_MAX_PEERS_PER_NODE','NODES_PER_HOST']);
  const outer = [...body.matchAll(/(?<!\\)\$\{([^}]+)\}/g)].map(m=>m[1]);
  assert.ok(outer.length >= 6);
  for (const expression of outer) {
    assert.ok(allowed.has(expression), 'unreviewed controller expansion: ' + expression);
  }
  assert.ok(!outer.some(x=>x.startsWith('#')), 'guest-side length incorrectly expands on controller');
});

test('Attempt 5 retains exact 20x250 topology and 32/4 full refresh', () => {
  const provision = readFileSync('benchmarks/scale/class-d-azure-5000-provision.sh','utf8');
  assert.match(provision, /^HOST_COUNT=20$/m);
  assert.match(provision, /^STRICT_NODES_PER_HOST=250$/m);
  assert.match(provision, /^BOOTSTRAP_MAX_PEERS_PER_NODE=32$/m);
  assert.match(provision, /^D5000_BOOTSTRAP_REFRESH_TARGET_COUNT=32$/m);
  assert.match(provision, /^D5000_BOOTSTRAP_REFRESH_TARGET_CONCURRENCY=4$/m);
  assert.match(campaign, /STAGE=readiness-barrier/);
  assert.match(campaign, /stage=baseline/);
  assert.match(campaign, /stage=healed/);
});
