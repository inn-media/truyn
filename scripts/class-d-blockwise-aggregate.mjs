#!/usr/bin/env node
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const inputRoot = process.argv[2] || process.env.BLOCKWISE_INPUT_DIR || 'blockwise-input';
const outDir = process.argv[3] || process.env.BLOCKWISE_AGGREGATE_DIR || 'blockwise-aggregate';
const EXPECTED = [
  'B01_SOURCE_INTEGRITY','B02_BOOTSTRAP_REFRESH','B03_RUNTIME_BUNDLE','B04_NETWORK',
  'B05_REGRESSION','B06_SECURITY','B07_COMPONENT','B08_INTEGRATION','B09_SDK',
  'B10_FAST_GOVERNANCE','B11_CLASS_D_ACCEPTANCE','B12_WORKFLOW_CONTRACT'
];
await fsp.mkdir(outDir, { recursive: true });

async function walk(dir, out = []) {
  for (const entry of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(p, out);
    else if (entry.name === 'block.json') out.push(p);
  }
  return out;
}
const files = await walk(inputRoot);
const blocks = [];
for (const file of files) {
  try {
    const value = JSON.parse(await fsp.readFile(file, 'utf8'));
    value._sourceFile = file;
    blocks.push(value);
  } catch (error) {
    blocks.push({
      blockId: `PARSE_ERROR_${blocks.length + 1}`,
      title: 'Artifact parse failure', status: 'RED', sourceSha: null,
      durationMs: 0, probeCompletion: { completed: 0, total: 0, complete: false },
      assertions: [], redAssertions: [{ probeId: 'aggregate-parse', name: file, status: 'RED', expected: { validJson: true }, observed: { validJson: false }, completed: true, durationMs: 0, errorClass: 'artifact_parse_error', errorMessage: error.message, errorEventCount: 1 }],
      errors: [{ probeId: 'aggregate-parse', errorClass: 'artifact_parse_error', errorMessage: error.message, errorEventCount: 1 }],
      eventCounts: { errorEvents: 1, totalEvents: 1 }
    });
  }
}
const byId = new Map(blocks.map((b) => [b.blockId, b]));
for (const id of EXPECTED) {
  if (byId.has(id)) continue;
  const missing = {
    schema: 'truyn.class-d.blockwise-preflight.block.v1', blockId: id, title: 'Missing block result', status: 'RED', sourceSha: null,
    durationMs: 0, harnessReturnCode: 1, probeCompletion: { completed: 0, total: 1, complete: false }, assertions: [],
    redAssertions: [{ probeId: `${id}-MISSING`, name: 'block-result-present', status: 'RED', expected: { present: true }, observed: { present: false }, completed: false, durationMs: 0, errorClass: 'missing_block_artifact', errorMessage: `No block.json found for ${id}`, errorEventCount: 1 }],
    errors: [{ probeId: `${id}-MISSING`, errorClass: 'missing_block_artifact', errorMessage: `No block.json found for ${id}`, errorEventCount: 1 }],
    eventCounts: { errorEvents: 1, totalEvents: 1 }
  };
  blocks.push(missing); byId.set(id, missing);
}
blocks.sort((a,b) => String(a.blockId).localeCompare(String(b.blockId)));
const canonicalBlocks = EXPECTED.map((id) => byId.get(id));
const sourceShas = [...new Set(canonicalBlocks.map((b) => b.sourceSha).filter(Boolean))];
const allAssertions = canonicalBlocks.flatMap((b) => (b.assertions || []).map((a) => ({ blockId: b.blockId, ...a })));
const allRed = canonicalBlocks.flatMap((b) => (b.redAssertions || []).map((a) => ({ blockId: b.blockId, ...a })));
const errorLedger = canonicalBlocks.flatMap((b) => (b.errors || []).map((e) => ({ blockId: b.blockId, ...e })));
const completedBlocks = canonicalBlocks.filter((b) => b.probeCompletion?.complete).length;
const greenBlocks = canonicalBlocks.filter((b) => b.status === 'GREEN').length;
const redBlocks = canonicalBlocks.filter((b) => b.status !== 'GREEN').length;
const eventCounts = canonicalBlocks.reduce((acc,b) => {
  for (const [k,v] of Object.entries(b.eventCounts || {})) acc[k] = (acc[k] || 0) + (Number(v) || 0);
  return acc;
}, {});
const status = redBlocks === 0 && sourceShas.length === 1 ? 'GREEN' : 'RED';
const summary = {
  schema: 'truyn.class-d.blockwise-preflight.summary.v1',
  status,
  sourceSha: sourceShas.length === 1 ? sourceShas[0] : null,
  sourceShas,
  blockCompletion: { completed: completedBlocks, expected: EXPECTED.length, green: greenBlocks, red: redBlocks },
  assertionCounts: { total: allAssertions.length + allRed.filter((a) => a.probeId?.endsWith('-MISSING')).length, red: allRed.length },
  eventCounts,
  durations: Object.fromEntries(canonicalBlocks.map((b) => [b.blockId, b.durationMs || 0])),
  blocks: canonicalBlocks.map((b) => ({ blockId: b.blockId, title: b.title, status: b.status, sourceSha: b.sourceSha, harnessReturnCode: b.harnessReturnCode, durationMs: b.durationMs, probeCompletion: b.probeCompletion, eventCounts: b.eventCounts }))
};
const redReport = {
  schema: 'truyn.class-d.blockwise-preflight.red-report.v1', status, sourceSha: summary.sourceSha,
  redAssertions: allRed,
  errorLedger,
  probeCompletion: Object.fromEntries(canonicalBlocks.map((b) => [b.blockId, b.probeCompletion])),
  eventCounts,
  durations: summary.durations
};
await fsp.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
await fsp.writeFile(path.join(outDir, 'red-report.json'), JSON.stringify(redReport, null, 2) + '\n');

const jsonl = [];
for (const block of canonicalBlocks) {
  jsonl.push(JSON.stringify({ type: 'block', blockId: block.blockId, status: block.status, sourceSha: block.sourceSha, durationMs: block.durationMs, probeCompletion: block.probeCompletion, eventCounts: block.eventCounts }));
  for (const assertion of block.assertions || []) jsonl.push(JSON.stringify({ type: 'assertion', blockId: block.blockId, ...assertion }));
  for (const red of block.redAssertions || []) jsonl.push(JSON.stringify({ type: 'red-assertion', blockId: block.blockId, ...red }));
  for (const error of block.errors || []) jsonl.push(JSON.stringify({ type: 'error-ledger', blockId: block.blockId, ...error }));
}
await fsp.writeFile(path.join(outDir, 'events.jsonl'), jsonl.join('\n') + '\n');

let md = `# Class-D Blockwise Preflight — ${status}\n\n`;
md += `**SHA:** ${summary.sourceSha ? `\`${summary.sourceSha}\`` : `multiple/missing: ${sourceShas.join(', ') || 'none'}`}  \n`;
md += `**Blocks:** ${greenBlocks} GREEN / ${redBlocks} RED / ${EXPECTED.length} total  \n`;
md += `**Probe completion:** ${completedBlocks}/${EXPECTED.length} blocks completed full probe cycles  \n`;
md += `**RED assertions:** ${allRed.length}  \n**Error ledger entries:** ${errorLedger.length}\n\n`;
md += `## Blocks\n\n| Block | Status | Probes | Duration | Error events |\n|---|---|---:|---:|---:|\n`;
for (const b of canonicalBlocks) md += `| ${b.blockId} — ${b.title || ''} | ${b.status} | ${b.probeCompletion?.completed ?? 0}/${b.probeCompletion?.total ?? 0} | ${b.durationMs || 0} ms | ${b.eventCounts?.errorEvents || 0} |\n`;
md += `\n## RED assertions\n`;
if (!allRed.length) md += `\nNone. All assertions GREEN.\n`;
for (const r of allRed) {
  md += `\n### ${r.blockId} / ${r.probeId} — ${r.name || 'assertion'}\n`;
  md += `- expected: \`${JSON.stringify(r.expected)}\`\n- observed: \`${JSON.stringify(r.observed)}\`\n- completed: \`${r.completed}\`\n- duration: \`${r.durationMs || 0} ms\`\n- error class: \`${r.errorClass || 'unknown'}\`\n- error events: \`${r.errorEventCount || 0}\`\n`;
  md += `- error message:\n\n\`\`\`text\n${String(r.errorMessage || '').slice(0, 12000)}\n\`\`\`\n`;
}
md += `\n## Error ledger\n`;
if (!errorLedger.length) md += `\nEmpty.\n`;
for (const e of errorLedger) md += `\n- **${e.blockId}/${e.probeId}** — ${e.errorClass || 'unknown'} — events=${e.errorEventCount || 0}: ${String(e.errorMessage || '').replaceAll('\n',' ').slice(0,2000)}\n`;
md += `\n## Event counts\n\n\`\`\`json\n${JSON.stringify(eventCounts, null, 2)}\n\`\`\`\n`;
await fsp.writeFile(path.join(outDir, 'report.md'), md);

const targets = ['summary.json','red-report.json','report.md','events.jsonl'];
const manifest = { schema: 'truyn.class-d.blockwise-preflight.aggregate-manifest.v1', sourceSha: summary.sourceSha, status, files: [] };
const checksumLines = [];
for (const name of targets) {
  const p = path.join(outDir, name); const data = await fsp.readFile(p); const hash = crypto.createHash('sha256').update(data).digest('hex'); const stat = await fsp.stat(p);
  checksumLines.push(`${hash}  ${name}`); manifest.files.push({ name, bytes: stat.size, sha256: hash });
}
await fsp.writeFile(path.join(outDir, 'checksums.sha256'), checksumLines.join('\n') + '\n');
await fsp.writeFile(path.join(outDir, 'artifact-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`TRUYN_CLASS_D_BLOCKWISE_TERMINAL status=${status} sha=${summary.sourceSha || 'mixed'} blocks=${completedBlocks}/${EXPECTED.length} green=${greenBlocks} red=${redBlocks} red_assertions=${allRed.length} error_ledger=${errorLedger.length}`);
process.exitCode = status === 'GREEN' ? 0 : 1;
