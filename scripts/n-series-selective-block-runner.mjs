#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const get = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const manifestPath = get('manifest');
const requested = (get('blocks') || '').split(',').map(v => v.trim()).filter(Boolean);
const jsonPath = get('json') || 'n-series-selective-block-results.json';
if (!manifestPath || !fs.existsSync(manifestPath)) {
  console.error('TRUYN_N_SELECTIVE_BLOCKS=FAIL reason=manifest_missing');
  process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest?.schema !== 'truyn.n-series.qualification-manifest.v1' || !/^[0-9a-f]{40}$/.test(manifest?.candidateSha || '')) {
  console.error('TRUYN_N_SELECTIVE_BLOCKS=FAIL reason=manifest_invalid');
  process.exit(2);
}
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (manifest.candidateSha !== head) {
  console.error('TRUYN_N_SELECTIVE_BLOCKS=FAIL reason=candidate_sha_mismatch');
  process.exit(2);
}
const blocks = requested.length ? requested : (manifest?.qualifiedBlocks || []);
const allowed = new Set(['N1','N2','N3','N4','N5','N6','N7']);
if (!blocks.length) {
  console.error('TRUYN_N_SELECTIVE_BLOCKS=FAIL reason=no_blocks');
  process.exit(2);
}
for (const b of blocks) if (!allowed.has(b)) {
  console.error(`TRUYN_N_SELECTIVE_BLOCKS=FAIL reason=unknown_block block=${b}`);
  process.exit(2);
}
const run = (cmd, argv) => execFileSync(cmd, argv, { stdio: 'inherit' });
const existsAny = paths => paths.some(p => fs.existsSync(p));

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
const writeResult = (passed) => fs.writeFileSync(jsonPath, JSON.stringify({
  schema:'truyn.n-series.selective-block-results.v1',
  candidateSha: manifest.candidateSha,
  requestedBlocks: blocks,
  blocks: results,
  allGreen: passed,
  status: passed ? 'GREEN' : 'RED',
  passed
}, null, 2) + '\n');
for (const block of blocks) {
  process.stdout.write(`TRUYN_N_BLOCK=${block} state=RUNNING\n`);
  try {
    runners[block]();
    results.push({ block, status: 'PASS' });
    process.stdout.write(`TRUYN_N_BLOCK=${block} state=PASS\n`);
  } catch (error) {
    results.push({ block, status: 'FAIL', error: String(error?.message || error) });
    writeResult(false);
    process.stderr.write(`TRUYN_N_BLOCK=${block} state=FAIL\n`);
    process.exit(1);
  }
}
writeResult(true);
console.log(`TRUYN_N_SELECTIVE_BLOCKS=PASS count=${blocks.length}`);
