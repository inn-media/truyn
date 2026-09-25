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
const manifestPath = value('--manifest', 'd-series-qualification-manifest.json');
const currentMainSha = value('--main', process.env.TRUYN_D_SERIES_CURRENT_MAIN_SHA || '');
const candidateSha = value('--candidate', process.env.TRUYN_D_SERIES_CANDIDATE_SHA || '');
const baseSha = value('--base', process.env.TRUYN_D_SERIES_BASE_SHA || '');
const output = value('--output', 'd-series-admission-plan.json');
const sha = /^[0-9a-f]{40}$/;
if (![currentMainSha, candidateSha, baseSha].every((v) => sha.test(v))) throw new Error('base, candidate and current main must be 40-char git SHAs');

const git = (...argv) => execFileSync('git', argv, { encoding: 'utf8' }).trim();
const frozen = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const reject = (reason) => {
  const plan = {
    schema: policy.admission.schema,
    policySchema: policy.schema,
    baseSha,
    candidateSha,
    currentMainSha,
    integrationTreeSha: null,
    baseToCurrentMainChangedFiles: [],
    affectedBlocks: [],
    surfaceFingerprints: [],
    decision: 'REJECT_STALE_OR_INVALID_MANIFEST',
    reason
  };
  fs.writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`);
  console.error(`TRUYN_D_SERIES_ADMISSION=FAIL reason=${reason}`);
  process.exit(2);
};

if (frozen.schema !== policy.manifest.schema) reject('manifest_schema_mismatch');
if (frozen.policySchema !== policy.schema) reject('policy_schema_mismatch');
if (frozen.baseSha !== baseSha || frozen.candidateSha !== candidateSha) reject('manifest_identity_mismatch');
const actualCandidateTree = git('rev-parse', `${candidateSha}^{tree}`);
if (frozen.candidateTreeSha !== actualCandidateTree) reject('candidate_tree_mismatch');
try { execFileSync('git', ['merge-base', '--is-ancestor', baseSha, candidateSha]); }
catch { reject('base_not_ancestor_of_candidate'); }
try { execFileSync('git', ['merge-base', '--is-ancestor', baseSha, currentMainSha]); }
catch { reject('base_not_ancestor_of_current_main'); }

let integrationTreeSha;
try {
  integrationTreeSha = git('merge-tree', '--write-tree', currentMainSha, candidateSha).split('\n')[0].trim();
  if (!sha.test(integrationTreeSha)) throw new Error('invalid merge tree output');
} catch (error) {
  const plan = {
    schema: policy.admission.schema,
    policySchema: policy.schema,
    baseSha,
    candidateSha,
    currentMainSha,
    integrationTreeSha: null,
    baseToCurrentMainChangedFiles: git('diff', '--name-only', `${baseSha}..${currentMainSha}`).split('\n').filter(Boolean).sort(),
    affectedBlocks: [],
    surfaceFingerprints: [],
    decision: 'REJECT_CONFLICT',
    reason: 'integration_merge_conflict'
  };
  fs.writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`);
  console.error('TRUYN_D_SERIES_ADMISSION=FAIL reason=integration_merge_conflict');
  process.exit(3);
}

const changedFiles = git('diff', '--name-only', `${baseSha}..${currentMainSha}`).split('\n').filter(Boolean).sort();
const listTree = (treeish) => git('ls-tree', '-r', '--full-tree', treeish)
  .split('\n').filter(Boolean)
  .map((line) => {
    const tab = line.indexOf('\t');
    return { raw: line, path: tab >= 0 ? line.slice(tab + 1) : '' };
  });
const integrationEntries = listTree(integrationTreeSha);
const frozenById = new Map((frozen.surfaces || []).map((surface) => [surface.id, surface]));
const surfaceFingerprints = [];
const affected = new Set();
for (const surface of policy.surfaces) {
  const regexes = surface.patterns.map((p) => new RegExp(p));
  const selected = integrationEntries.filter((entry) => regexes.some((re) => re.test(entry.path))).map((entry) => entry.raw).sort();
  const integrationSha256 = crypto.createHash('sha256').update(selected.join('\n')).digest('hex');
  const frozenSurface = frozenById.get(surface.id);
  if (!frozenSurface?.sha256) reject(`manifest_surface_missing:${surface.id}`);
  const directlyTouched = changedFiles.filter((file) => regexes.some((re) => re.test(file)));
  const fingerprintChanged = frozenSurface.sha256 !== integrationSha256;
  if (directlyTouched.length || fingerprintChanged) for (const block of surface.blocks) affected.add(block);
  surfaceFingerprints.push({
    id: surface.id,
    blocks: surface.blocks,
    frozenCandidateSha256: frozenSurface.sha256,
    integrationSha256,
    changed: fingerprintChanged,
    baseToCurrentMainMatches: directlyTouched
  });
}
const affectedBlocks = [...affected].sort();
const decision = affectedBlocks.length ? 'REQUALIFY_AFFECTED_BLOCKS' : 'ADMIT_WITH_FROZEN_EVIDENCE';
const plan = {
  schema: policy.admission.schema,
  policySchema: policy.schema,
  model: policy.model,
  baseSha,
  candidateSha,
  currentMainSha,
  candidateTreeSha: actualCandidateTree,
  integrationTreeSha,
  scale: frozen.scale,
  baseToCurrentMainChangedFiles: changedFiles,
  affectedBlocks,
  surfaceFingerprints,
  decision,
  frozenEvidenceRemainsValidForUntouchedSurfaces: true,
  automaticFullRerunForbidden: true,
  liveDRunRequired: false,
  liveDRunDecision: affectedBlocks.length ? 'DEFER_UNTIL_AFFECTED_BLOCKS_REQUALIFIED' : 'NOT_REQUIRED_BY_MAIN_MOVEMENT'
};
fs.writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`);
console.log(`TRUYN_D_SERIES_ADMISSION_PLAN=PASS decision=${decision} base=${baseSha} candidate=${candidateSha} main=${currentMainSha} integration_tree=${integrationTreeSha} affected_blocks=${affectedBlocks.join(',') || 'none'}`);
