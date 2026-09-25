#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const policy = JSON.parse(fs.readFileSync('config/d-series-frozen-candidate-admission.json', 'utf8'));
const args = process.argv.slice(2);
const value = (name, fallback = '') => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const baseSha = value('--base', process.env.TRUYN_D_SERIES_BASE_SHA || '');
const candidateSha = value('--candidate', process.env.TRUYN_D_SERIES_CANDIDATE_SHA || process.env.GITHUB_SHA || '');
const scale = value('--scale', process.env.TRUYN_D_SERIES_SCALE || 'all');
const output = value('--output', 'd-series-qualification-manifest.json');
const qualificationRunId = value('--qualification-run', process.env.GITHUB_RUN_ID || '');
const liveRunId = value('--live-run', process.env.TRUYN_D_SERIES_LIVE_RUN || '');

const sha = /^[0-9a-f]{40}$/;
if (!sha.test(baseSha) || !sha.test(candidateSha)) throw new Error('base and candidate must be 40-char git SHAs');
if (!['all', 'd200', 'd500', 'd1000'].includes(scale)) throw new Error(`invalid scale: ${scale}`);

const git = (...argv) => execFileSync('git', argv, { encoding: 'utf8' }).trim();
try { execFileSync('git', ['merge-base', '--is-ancestor', baseSha, candidateSha]); }
catch { throw new Error(`BASE_SHA ${baseSha} is not an ancestor of candidate ${candidateSha}`); }

const candidateTreeSha = git('rev-parse', `${candidateSha}^{tree}`);
const listTree = (treeish) => git('ls-tree', '-r', '--full-tree', treeish)
  .split('\n').filter(Boolean)
  .map((line) => {
    const tab = line.indexOf('\t');
    return { raw: line, path: tab >= 0 ? line.slice(tab + 1) : '' };
  });
const candidateEntries = listTree(candidateTreeSha);
const fingerprint = (surface, entries) => {
  const regexes = surface.patterns.map((p) => new RegExp(p));
  const selected = entries.filter((entry) => regexes.some((re) => re.test(entry.path))).map((entry) => entry.raw).sort();
  return {
    sha256: crypto.createHash('sha256').update(selected.join('\n')).digest('hex'),
    fileCount: selected.length
  };
};

const surfaces = policy.surfaces.map((surface) => ({
  id: surface.id,
  blocks: surface.blocks,
  ...fingerprint(surface, candidateEntries)
}));
const candidateDelta = git('diff', '--name-only', `${baseSha}..${candidateSha}`).split('\n').filter(Boolean).sort();

const manifest = {
  schema: policy.manifest.schema,
  policySchema: policy.schema,
  model: policy.model,
  baseSha,
  candidateSha,
  candidateTreeSha,
  scale,
  qualifiedAt: new Date().toISOString(),
  qualificationEvidence: {
    qualificationRunId: qualificationRunId ? String(qualificationRunId) : null,
    liveRunId: liveRunId ? String(liveRunId) : null,
    immutableCandidate: true,
    branchQualification: true
  },
  candidateChangedFiles: candidateDelta,
  surfaces
};
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`TRUYN_D_SERIES_QUALIFICATION_MANIFEST=PASS candidate=${candidateSha} base=${baseSha} tree=${candidateTreeSha} scale=${scale} output=${output}`);
