#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';

function fail(reason, detail = '') {
  console.error(`TRUYN_D_SERIES_ADMISSION_FINALIZE=FAIL reason=${reason}${detail ? ` detail=${detail}` : ''}`);
  process.exit(1);
}

function arg(name, required = false) {
  const i = process.argv.indexOf(name);
  const value = i >= 0 ? process.argv[i + 1] : '';
  if (required && !value) fail(`missing_${name.replace(/^--/, '').replaceAll('-', '_')}`);
  return value;
}

function readJson(path, label) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch { fail(`invalid_${label}`, path); }
}

function sha256(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

const manifestPath = arg('--manifest', true);
const resultPrefix = arg('--result-prefix', true);
const outputPath = arg('--output', true);
const manifest = readJson(manifestPath, 'admission_manifest');

if (manifest.schema !== 'truyn.d-series.admission-manifest.v1') fail('admission_manifest_schema');
if (manifest.decision?.automaticFullRerunForbidden !== true) fail('automatic_full_rerun_policy_missing');
if (!/^[0-9a-f]{40}$/.test(manifest.integrationTreeSha || '')) fail('integration_tree_invalid');
if (!['all', 'd200', 'd500', 'd1000'].includes(manifest.scale)) fail('invalid_scale', String(manifest.scale));

const expectedScale = ({ all: 'all', d200: '200', d500: '500', d1000: '1000' })[manifest.scale];
const targetedBlocks = manifest.decision?.targetedBlocks;
if (!Array.isArray(targetedBlocks)) fail('targeted_blocks_missing');
if (new Set(targetedBlocks).size !== targetedBlocks.length) fail('duplicate_targeted_blocks');
for (const block of targetedBlocks) {
  if (!/^B(?:0[1-9]|1[0-6])$/.test(block)) fail('invalid_targeted_block', block);
}

const liveRerunOriginallyRequired = manifest.decision?.liveRerunRequired === true;
if (liveRerunOriginallyRequired && targetedBlocks.length === 0) fail('live_rerun_without_targeted_blocks');

const results = {};
for (const block of targetedBlocks) {
  const path = `${resultPrefix}${block}.json`;
  let raw;
  try { raw = fs.readFileSync(path, 'utf8'); }
  catch { fail('targeted_result_missing', block); }
  const result = readJson(path, `targeted_result_${block}`);
  if (result.schema !== 'truyn.d-series.block-result.v1') fail('targeted_result_schema', block);
  if (result.blockId !== block) fail('targeted_result_block_mismatch', block);
  if (result.status !== 'PASS') fail('targeted_result_not_pass', block);
  if (result.sourceSha !== manifest.integrationTreeSha) fail('targeted_result_source_mismatch', block);
  if (String(result.scale) !== expectedScale) fail('targeted_result_scale_mismatch', block);
  if (!/^[0-9a-f]{64}$/.test(result.fingerprint || '')) fail('targeted_result_fingerprint_invalid', block);
  results[block] = {
    status: result.status,
    sourceSha: result.sourceSha,
    scale: String(result.scale),
    classesTested: result.classesTested,
    fingerprint: result.fingerprint,
    evidenceDigest: `sha256:${sha256(raw)}`,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt
  };
}

manifest.requalification = {
  schema: 'truyn.d-series.targeted-requalification.v1',
  mode: 'targeted-blocks',
  requiredBlocks: targetedBlocks,
  allPassed: true,
  liveRerunOriginallyRequired,
  integrationTreeSha: manifest.integrationTreeSha,
  results
};
manifest.decision.liveRerunOriginallyRequired = liveRerunOriginallyRequired;
manifest.decision.liveRerunSatisfied = true;
manifest.decision.liveRerunRequired = false;
manifest.decision.targetedRequalificationPassed = true;
manifest.decision.status = 'PASS_COMPATIBLE';
manifest.decision.admissionPassed = true;

fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`TRUYN_D_SERIES_ADMISSION_FINALIZE=PASS candidate=${manifest.candidateSha} targeted=${targetedBlocks.join(',') || 'none'} live_rerun_originally_required=${liveRerunOriginallyRequired}`);
