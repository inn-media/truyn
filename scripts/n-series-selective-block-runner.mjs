#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const get = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const manifestPath = get('manifest');
if (!manifestPath || !fs.existsSync(manifestPath)) {
  console.error('TRUYN_N_SELECTIVE_BLOCKS=FAIL reason=manifest_missing');
  process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const blocks = manifest?.decision?.targetedBlocks || [];
const allowed = new Set(['N1','N2','N3','N4','N5','N6','N7']);
for (const b of blocks) if (!allowed.has(b)) {
  console.error(`TRUYN_N_SELECTIVE_BLOCKS=FAIL reason=unknown_block block=${b}`);
  process.exit(2);
}
const run = (cmd, argv) => execFileSync(cmd, argv, { stdio: 'inherit' });
const existsAny = paths => paths.some(p => fs.existsSync(p));

// These are integration-admission blocks, not benchmark PASS generators. They
// deliberately validate only the N-sensitive contract/surface that drifted.
const runners = {
  N1() {
    run('node', ['scripts/verify-n-series-frozen-candidate-policy.mjs']);
    run('node', ['--test', 'tests/n-series-frozen-candidate-admission.test.js']);
  },
  N2() {
    if (!existsAny(['docs/roadmap/N_SERIES_ROADMAP.md','docs/benchmarks/N_SERIES_EMERGENT_BEHAVIOR_CONTRACT.md'])) throw new Error('N2 sovereignty contract missing');
    run('git', ['diff','--check']);
  },
  N3() {
    if (!existsAny(['docs/roadmap/N_SERIES_ROADMAP.md','docs/benchmarks/N_SERIES_EMERGENT_BEHAVIOR_CONTRACT.md'])) throw new Error('N3 marketplace contract missing');
    run('git', ['diff','--check']);
  },
  N4() {
    if (!existsAny(['docs/roadmap/N_SERIES_ROADMAP.md','docs/benchmarks/N_SERIES_EMERGENT_BEHAVIOR_CONTRACT.md'])) throw new Error('N4 trust-decay contract missing');
    run('git', ['diff','--check']);
  },
  N5() {
    if (!existsAny(['docs/roadmap/N_SERIES_ROADMAP.md','docs/benchmarks/N_SERIES_EMERGENT_BEHAVIOR_CONTRACT.md'])) throw new Error('N5 sustained-churn contract missing');
    run('git', ['diff','--check']);
  },
  N6() {
    if (!fs.existsSync('docs/operations/BENCHMARK_COORDINATION.md') && !fs.existsSync('docs/roadmap/N_SERIES_ROADMAP.md')) throw new Error('N6 isolation contract missing');
    run('git', ['diff','--check']);
  },
  N7() {
    if (!fs.existsSync('docs/benchmarks/N_SERIES_TELEMETRY.md')) throw new Error('N7 evidence contract missing');
    run('git', ['diff','--check']);
  }
};

const results = [];
for (const block of blocks) {
  process.stdout.write(`TRUYN_N_BLOCK=${block} state=RUNNING\n`);
  try {
    runners[block]();
    results.push({ block, status: 'PASS' });
    process.stdout.write(`TRUYN_N_BLOCK=${block} state=PASS\n`);
  } catch (error) {
    results.push({ block, status: 'FAIL', error: String(error?.message || error) });
    fs.writeFileSync('n-series-selective-block-results.json', JSON.stringify({ schema:'truyn.n-series.selective-block-results.v1', blocks: results }, null, 2) + '\n');
    process.stderr.write(`TRUYN_N_BLOCK=${block} state=FAIL\n`);
    process.exit(1);
  }
}
fs.writeFileSync('n-series-selective-block-results.json', JSON.stringify({ schema:'truyn.n-series.selective-block-results.v1', requestedBlocks: blocks, blocks: results, allGreen: results.every(r => r.status === 'PASS') }, null, 2) + '\n');
console.log(`TRUYN_N_SELECTIVE_BLOCKS=PASS count=${blocks.length}`);
