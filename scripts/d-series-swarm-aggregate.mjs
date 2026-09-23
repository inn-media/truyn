#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const value = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
};
const has = (flag) => args.includes(flag);
const stagesDir = value('--stages', 'd-series-swarm-stages');
const blocksDir = value('--blocks', 'd-series-swarm-blocks');
const lanesDir = value('--lanes', 'd-series-swarm-lanes');
const sourceSha = value('--source-sha', process.env.TRUYN_CLASS_D_SOURCE_SHA || process.env.GITHUB_SHA || '');
const scale = value('--scale', 'all');
const outputPath = value('--output', 'd-series-swarm-summary.json');
const enforce = has('--enforce');

const scaleClasses = new Map([
  ['all', [200, 500, 1000]],
  ['d200', [200]],
  ['d500', [500]],
  ['d1000', [1000]]
]);
if (!scaleClasses.has(scale)) throw new Error(`invalid scale: ${scale}`);
if (!/^[0-9a-f]{40}$/.test(sourceSha)) throw new Error(`invalid source SHA: ${sourceSha}`);

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const fingerprint = (material) => crypto.createHash('sha256').update(material).digest('hex');
const causes = new Map();
const addCause = (record) => {
  const key = record.fingerprint || fingerprint(JSON.stringify(record));
  if (!causes.has(key)) causes.set(key, { ...record, fingerprint: key, occurrences: 0, sources: [] });
  const item = causes.get(key);
  item.occurrences += 1;
  if (record.source) item.sources.push(record.source);
};

const selectedClasses = scaleClasses.get(scale);
const stageEvidence = [];
let clean = true;

for (const classSize of selectedClasses) {
  const candidates = classSize === 200
    ? [path.join(stagesDir, 'd200-stage-checkpoint.json'), path.join(stagesDir, 'd-series-swarm-stage-200.json')]
    : [path.join(stagesDir, `d-series-swarm-stage-${classSize}.json`)];
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) {
    clean = false;
    addCause({ kind: 'INFRA', domain: 'swarm-stage-evidence', source: `D-${classSize}`, signature: 'missing stage checkpoint' });
    continue;
  }
  const checkpoint = readJson(file);
  const sourceExact = checkpoint.sourceSha === sourceSha;
  const classExact = Number(checkpoint.classSize) === classSize;
  const summaryClean = checkpoint.summary?.clean === true;
  if (!sourceExact || !classExact || !summaryClean) clean = false;
  for (const result of checkpoint.results || []) {
    if (result.status === 'PASS') continue;
    addCause({
      kind: result.status || 'INFRA',
      domain: result.id || 'stage',
      source: `D-${classSize}:${result.id || 'unknown'}`,
      fingerprint: result.fingerprint,
      signature: result.error || result.stderr || result.stdout || 'stage failure'
    });
  }
  if (!sourceExact) addCause({ kind: 'INFRA', domain: 'source-binding', source: `D-${classSize}`, signature: `stage source ${checkpoint.sourceSha || 'missing'} != ${sourceSha}` });
  if (!classExact) addCause({ kind: 'INFRA', domain: 'class-binding', source: `D-${classSize}`, signature: `checkpoint class ${checkpoint.classSize}` });
  stageEvidence.push({
    classSize,
    sourceSha: checkpoint.sourceSha,
    clean: summaryClean,
    counts: checkpoint.summary?.counts || null
  });
}

const legacyLaneEvidence = [];
if (selectedClasses.includes(200)) {
  const expectedLanes = [
    'contract-repository', 'runtime-bundle-staging', 'cloud-oidc-contract', 'topology-placement',
    'readiness-lease', 'routing-repair', 'recovery-fault', 'durability', 'cleanup',
    'safety-security', 'evidence-evaluator', 'campaign-runtime-syntax'
  ];
  for (const laneId of expectedLanes) {
    const file = path.join(lanesDir, `d200-lane-${laneId}.json`);
    if (!fs.existsSync(file)) {
      clean = false;
      addCause({ kind: 'INFRA', domain: 'd200-lane-evidence', source: `D-200:${laneId}`, signature: 'missing legacy lane evidence' });
      continue;
    }
    const lane = readJson(file);
    const sourceExact = lane.sourceSha === sourceSha;
    const pass = lane.status === 'PASS';
    if (!sourceExact || !pass) clean = false;
    if (!pass) {
      addCause({
        kind: lane.status || 'INFRA',
        domain: lane.domain || laneId,
        source: `D-200:${laneId}`,
        fingerprint: lane.fingerprint,
        signature: lane.firstFailure?.signature || 'legacy lane failure'
      });
    }
    if (!sourceExact) addCause({ kind: 'INFRA', domain: 'source-binding', source: `D-200:${laneId}`, signature: `lane source ${lane.sourceSha || 'missing'} != ${sourceSha}` });
    legacyLaneEvidence.push({ laneId, domain: lane.domain, status: lane.status, sourceSha: lane.sourceSha, fingerprint: lane.fingerprint });
  }
}

const blockEvidence = [];
for (let index = 1; index <= 16; index += 1) {
  const blockId = `B${String(index).padStart(2, '0')}`;
  const file = path.join(blocksDir, `d-series-block-${blockId}.json`);
  if (!fs.existsSync(file)) {
    clean = false;
    addCause({ kind: 'INFRA', domain: 'block-evidence', source: blockId, signature: 'missing block evidence' });
    continue;
  }
  const block = readJson(file);
  const sourceExact = block.sourceSha === sourceSha;
  const pass = block.status === 'PASS';
  if (!sourceExact || !pass) clean = false;
  if (!pass) {
    addCause({
      kind: block.status || 'INFRA',
      domain: block.domain || blockId,
      source: blockId,
      fingerprint: block.fingerprint,
      signature: block.firstFailure?.signature || 'block failure'
    });
  }
  if (!sourceExact) addCause({ kind: 'INFRA', domain: 'source-binding', source: blockId, signature: `block source ${block.sourceSha || 'missing'} != ${sourceSha}` });
  blockEvidence.push({
    blockId,
    domain: block.domain,
    status: block.status,
    sourceSha: block.sourceSha,
    fingerprint: block.fingerprint
  });
}

const rootCauses = [...causes.values()].map((item) => ({
  ...item,
  sources: [...new Set(item.sources)].sort()
})).sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));

const output = {
  schema: 'truyn.d-series.sanitation-swarm.v1',
  sourceSha,
  scale,
  selectedClasses,
  clean,
  stageEvidence,
  legacyLaneEvidence,
  blockEvidence,
  rootCauseCount: rootCauses.length,
  rootCauses,
  policy: {
    primaryEngine: 'sanitation-swarm',
    blockwiseRole: 'diagnostic-shards-and-mandatory-admission-gate',
    failCollect: true,
    failClosed: true,
    acceptanceWeakeningForbidden: true
  }
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`TRUYN_D_SERIES_SWARM clean=${clean} scale=${scale} source_sha=${sourceSha} root_causes=${rootCauses.length} output=${outputPath}`);
if (enforce && !clean) process.exitCode = 1;
