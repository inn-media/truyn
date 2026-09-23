#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const root = argv[0] || 'd-series-results';
const outputIndex = argv.indexOf('--output');
const sourceIndex = argv.indexOf('--source-sha');
const scopeIndex = argv.indexOf('--scope');
const selectedIndex = argv.indexOf('--selected-block');
const enforce = argv.includes('--enforce');
const outputPath = outputIndex >= 0 ? argv[outputIndex + 1] : 'd-series-blockwise-summary.json';
const expectedSourceSha = sourceIndex >= 0 ? argv[sourceIndex + 1] : (process.env.TRUYN_CLASS_D_SOURCE_SHA || process.env.GITHUB_SHA || null);
const scope = scopeIndex >= 0 ? argv[scopeIndex + 1] : 'full';
const selectedBlock = selectedIndex >= 0 ? argv[selectedIndex + 1] : null;
const expectedBlocks = Array.from({ length: 16 }, (_, index) => `B${String(index + 1).padStart(2, '0')}`);

const files = fs.existsSync(root)
  ? fs.readdirSync(root).filter((name) => name.endsWith('.json')).map((name) => path.join(root, name))
  : [];
const rows = files.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')))
  .filter((row) => row?.schema === 'truyn.d-series.block-result.v1');
const byBlock = new Map();
for (const row of rows) {
  if (byBlock.has(row.blockId)) throw new Error(`duplicate D-Series block evidence: ${row.blockId}`);
  byBlock.set(row.blockId, row);
}

const required = scope === 'targeted'
  ? [selectedBlock].filter(Boolean)
  : expectedBlocks;
const missing = required.filter((blockId) => !byBlock.has(blockId));
const stale = [...byBlock.values()].filter((row) => expectedSourceSha && row.sourceSha !== expectedSourceSha).map((row) => row.blockId);
const failed = required.filter((blockId) => byBlock.get(blockId)?.status !== 'PASS');
const passCount = required.filter((blockId) => byBlock.get(blockId)?.status === 'PASS').length;
const clean = missing.length === 0 && stale.length === 0 && failed.length === 0 && (scope === 'targeted' || required.length === 16);

const summary = {
  schema: 'truyn.d-series.blockwise-summary.v1',
  sourceSha: expectedSourceSha,
  scope,
  selectedBlock: scope === 'targeted' ? selectedBlock : null,
  expectedBlocks: required,
  passCount,
  totalRequired: required.length,
  clean,
  missing,
  stale,
  failed,
  blocks: required.map((blockId) => {
    const row = byBlock.get(blockId);
    return row ? {
      blockId,
      name: row.name,
      domain: row.domain,
      status: row.status,
      fingerprint: row.fingerprint,
      firstFailure: row.firstFailure,
      liveQualification: row.liveQualification
    } : { blockId, status: 'MISSING' };
  })
};

fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
const result = clean ? 'PASS' : 'FAIL';
console.log(`TRUYN_D_SERIES_BLOCKWISE_TERMINAL result=${result} scope=${scope} source_sha=${expectedSourceSha || 'unknown'} blocks=${passCount}/${required.length} failed=${failed.join(',') || 'none'} missing=${missing.join(',') || 'none'} stale=${stale.join(',') || 'none'}`);
if (enforce && !clean) process.exitCode = 1;
