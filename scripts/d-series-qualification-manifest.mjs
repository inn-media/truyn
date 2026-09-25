#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const policyPath = 'config/d-series-frozen-candidate-policy.json';

function fail(reason, detail = '') {
  console.error(`TRUYN_D_SERIES_QUALIFICATION_MANIFEST=FAIL reason=${reason}${detail ? ` detail=${detail}` : ''}`);
  process.exit(1);
}
function arg(name, required = false) {
  const i = process.argv.indexOf(name);
  const value = i >= 0 ? process.argv[i + 1] : '';
  if (required && !value) fail(`missing_${name.replace(/^--/, '').replaceAll('-', '_')}`);
  return value;
}
function git(args, allowFailure = false) {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (!allowFailure && r.status !== 0) fail('git_command_failed', `${args.join(' ')}:${(r.stderr || '').trim()}`);
  return r;
}
function exactSha(ref) {
  const value = git(['rev-parse', `${ref}^{commit}`]).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(value)) fail('invalid_commit_sha', ref);
  return value;
}
function treeSha(ref) {
  const value = git(['rev-parse', `${ref}^{tree}`]).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(value)) fail('invalid_tree_sha', ref);
  return value;
}
function digest(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function matches(path, prefixes) { return prefixes.some((prefix) => path === prefix || path.startsWith(prefix)); }
function changedFiles(base, head) {
  const out = git(['diff', '--name-only', `${base}..${head}`]).stdout;
  return out.split('\n').map((x) => x.trim()).filter(Boolean).sort();
}
function fingerprint(ref, prefixes) {
  const out = git(['ls-tree', '-r', '--full-tree', ref, '--', ...prefixes]).stdout
    .split('\n').map((x) => x.trim()).filter(Boolean).sort().join('\n');
  return digest(out ? `${out}\n` : '');
}
function readJson(path, label) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch { fail(`invalid_${label}`); }
}
if (!fs.existsSync(policyPath)) fail('policy_missing');
const policyRaw = fs.readFileSync(policyPath, 'utf8');
const policy = readJson(policyPath, 'policy');
if (policy.schema !== 'truyn.d-series.frozen-candidate-policy.v1' || policy.state !== 'LOCKED') fail('policy_not_locked');

const mode = process.argv[2];
if (!['qualification', 'admission'].includes(mode)) fail('invalid_mode');
const output = arg('--output', true);
const scale = arg('--scale', true);
if (!['all', 'd200', 'd500', 'd1000'].includes(scale)) fail('invalid_scale', scale);

if (mode === 'qualification') {
  const baseSha = exactSha(arg('--base-sha', true));
  const candidateSha = exactSha(arg('--candidate-sha', true));
  const ancestor = git(['merge-base', '--is-ancestor', baseSha, candidateSha], true);
  if (ancestor.status !== 0) fail('base_not_ancestor_of_candidate');
  const swarmRunId = arg('--swarm-run-id', true);
  const blockwiseRunId = arg('--blockwise-run-id', true);
  if (!/^[1-9][0-9]+$/.test(swarmRunId) || !/^[1-9][0-9]+$/.test(blockwiseRunId)) fail('invalid_evidence_run_id');
  const surfaces = Object.fromEntries(policy.surfaces.map((surface) => [surface.id, {
    fingerprint: fingerprint(candidateSha, surface.prefixes),
    blocks: surface.blocks,
    liveRerunRequired: surface.liveRerunRequired
  }]));
  const manifest = {
    schema: 'truyn.d-series.qualification-manifest.v1', model: policy.model,
    policyDigest: `sha256:${digest(policyRaw)}`, scale, baseSha, candidateSha,
    candidateTreeSha: treeSha(candidateSha),
    evidence: { sanitationSwarmRunId: Number(swarmRunId), blockwiseRunId: Number(blockwiseRunId), exactCandidate: true },
    surfaces
  };
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`TRUYN_D_SERIES_QUALIFICATION_MANIFEST=PASS mode=qualification candidate=${candidateSha} base=${baseSha} scale=${scale}`);
  process.exit(0);
}

const qualificationPath = arg('--qualification-manifest', true);
const q = readJson(qualificationPath, 'qualification_manifest');
if (q.schema !== 'truyn.d-series.qualification-manifest.v1') fail('qualification_manifest_schema');
const baseSha = exactSha(arg('--base-sha', true));
const candidateSha = exactSha(arg('--candidate-sha', true));
const currentMainSha = exactSha(arg('--current-main-sha', true));
const integrationRef = arg('--integration-ref', true);
const integrationTreeSha = treeSha(integrationRef);
if (q.baseSha !== baseSha || q.candidateSha !== candidateSha || q.scale !== scale) fail('qualification_manifest_identity_mismatch');
if (q.policyDigest !== `sha256:${digest(policyRaw)}`) fail('qualification_manifest_policy_digest_mismatch');

const mainDelta = changedFiles(baseSha, currentMainSha);
const candidateDelta = changedFiles(baseSha, candidateSha);
const surfaceResults = {};
const impactedBlocks = new Set();
let sensitiveMainDrift = false;
let liveRerunRequired = false;

for (const surface of policy.surfaces) {
  const mainChangedFiles = mainDelta.filter((file) => matches(file, surface.prefixes));
  const candidateFingerprint = q.surfaces?.[surface.id]?.fingerprint;
  if (!candidateFingerprint) fail('qualification_surface_missing', surface.id);
  const integrationFingerprint = fingerprint(integrationRef, surface.prefixes);
  const fingerprintChanged = candidateFingerprint !== integrationFingerprint;
  if (mainChangedFiles.length > 0) {
    sensitiveMainDrift = true;
    for (const block of surface.blocks) impactedBlocks.add(block);
    if (surface.liveRerunRequired) liveRerunRequired = true;
  }
  surfaceResults[surface.id] = { mainChangedFiles, candidateFingerprint, integrationFingerprint, fingerprintChanged, blocks: surface.blocks, liveRerunRequired: surface.liveRerunRequired };
}
if (!sensitiveMainDrift) {
  const unexpected = Object.entries(surfaceResults).filter(([, value]) => value.fingerprintChanged);
  if (unexpected.length) fail('fingerprint_drift_without_sensitive_main_delta', unexpected.map(([id]) => id).join(','));
}

const targetedBlocks = [...impactedBlocks].sort();
const manifest = {
  schema: 'truyn.d-series.admission-manifest.v1', model: policy.model,
  policyDigest: `sha256:${digest(policyRaw)}`, scale, baseSha, candidateSha,
  candidateTreeSha: q.candidateTreeSha, currentMainSha, currentMainTreeSha: treeSha(currentMainSha), integrationTreeSha,
  evidence: q.evidence,
  deltas: { baseToCurrentMain: mainDelta, baseToCandidate: candidateDelta },
  surfaces: surfaceResults,
  decision: {
    admissionRequired: true, sensitiveMainDrift, targetedBlocks,
    reuseExpensiveEvidence: !liveRerunRequired, liveRerunRequired,
    automaticFullRerunForbidden: true,
    status: liveRerunRequired ? 'LIVE_REQUALIFICATION_REQUIRED' : (sensitiveMainDrift ? 'TARGETED_REQUALIFICATION' : 'COMPATIBLE_NO_D_DRIFT')
  }
};
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`TRUYN_D_SERIES_QUALIFICATION_MANIFEST=PASS mode=admission candidate=${candidateSha} current_main=${currentMainSha} targeted=${targetedBlocks.join(',') || 'none'} live_rerun=${liveRerunRequired}`);
