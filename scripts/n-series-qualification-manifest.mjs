#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const mode = args.shift();
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const run = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const policy = JSON.parse(fs.readFileSync('config/n-series-frozen-candidate-policy.json', 'utf8'));
const prefixes = policy.surfaces.flatMap(s => s.prefixes);
const fingerprint = ref => {
  const rows = [];
  for (const p of [...new Set(prefixes)].sort()) {
    let out = '';
    try { out = run('ls-tree', '-r', ref, '--', p); } catch {}
    rows.push(`${p}\n${out}`);
  }
  return sha256(rows.join('\n'));
};
const changed = (base, head) => run('diff', '--name-only', base, head).split('\n').filter(Boolean);
const matchSurface = file => policy.surfaces.filter(s => s.prefixes.some(p => file === p || file.startsWith(p))).map(s => s.id);
const affected = files => [...new Set(files.flatMap(f => policy.surfaces.filter(s => matchSurface(f).includes(s.id)).flatMap(s => s.blocks)))].sort();
const liveRequired = files => policy.surfaces.some(s => s.liveRerunRequired && files.some(f => s.prefixes.some(p => f === p || f.startsWith(p))));
const write = (path, data) => fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');

if (mode === 'qualification') {
  const baseSha = opt('base-sha');
  const candidateSha = opt('candidate-sha');
  const output = opt('output', 'n-series-qualification-manifest.json');
  if (!/^[0-9a-f]{40}$/.test(baseSha || '') || !/^[0-9a-f]{40}$/.test(candidateSha || '')) process.exit(2);
  const files = changed(baseSha, candidateSha);
  write(output, {
    schema: 'truyn.n-series.qualification-manifest.v1',
    model: policy.model,
    baseSha,
    candidateSha,
    candidateFingerprint: fingerprint(candidateSha),
    changedFiles: files,
    nSensitiveSurfaces: [...new Set(files.flatMap(matchSurface))].sort(),
    qualifiedBlocks: affected(files),
    generatedAt: new Date().toISOString()
  });
} else if (mode === 'admission') {
  const qPath = opt('qualification-manifest');
  const currentMainSha = opt('current-main-sha');
  const integrationRef = opt('integration-ref');
  const output = opt('output', 'n-series-admission-manifest.json');
  const q = JSON.parse(fs.readFileSync(qPath, 'utf8'));
  const drift = changed(q.baseSha, currentMainSha);
  const surfaces = [...new Set(drift.flatMap(matchSurface))].sort();
  const blocks = affected(drift);
  write(output, {
    schema: 'truyn.n-series.admission-manifest.v1',
    model: policy.model,
    baseSha: q.baseSha,
    candidateSha: q.candidateSha,
    currentMainSha,
    integrationFingerprint: fingerprint(integrationRef),
    baseToCurrentMainChangedFiles: drift,
    decision: {
      nSensitiveDrift: surfaces.length > 0,
      affectedSurfaces: surfaces,
      targetedBlocks: blocks,
      reuseExpensiveCandidateEvidence: true,
      automaticFullRerun: false,
      liveRerunRequired: liveRequired(drift),
      finalAdmissionGateRequired: true
    },
    generatedAt: new Date().toISOString()
  });
} else {
  console.error('usage: n-series-qualification-manifest.mjs qualification|admission ...');
  process.exit(2);
}
