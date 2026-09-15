#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function aggregate({ config, results }) {
  const expected = config.lanes.map((lane) => lane.id);
  const byId = new Map(results.map((result) => [result.laneId, result]));
  const normalized = expected.map((laneId) => {
    const found = byId.get(laneId);
    if (found) return found;
    const fingerprint = crypto.createHash('sha256').update(`missing|${laneId}`).digest('hex');
    return { schema: 'truyn.d200.bug-hunt.result.v1', laneId, domain: 'orchestration', status: 'INFRA', fingerprint, firstFailure: { label: 'missing-result', exitCode: null, signature: 'lane result missing' }, commands: [] };
  });
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, INFRA: 0, SKIP: 0 };
  for (const result of normalized) counts[result.status] = (counts[result.status] || 0) + 1;
  const groups = new Map();
  for (const result of normalized.filter((item) => item.status !== 'PASS' && item.status !== 'SKIP')) {
    const key = result.fingerprint || crypto.createHash('sha256').update(`${result.domain}|${result.laneId}`).digest('hex');
    const group = groups.get(key) || { fingerprint: key, statusSet: [], lanes: [], domains: [], firstFailures: [] };
    group.statusSet.push(result.status);
    group.lanes.push(result.laneId);
    group.domains.push(result.domain);
    if (result.firstFailure) group.firstFailures.push(result.firstFailure);
    groups.set(key, group);
  }
  return {
    schema: 'truyn.d200.bug-hunt.aggregate.v1',
    sourceSha: normalized.find((item) => item.sourceSha)?.sourceSha || null,
    expectedLanes: expected,
    counts,
    allTerminal: normalized.length === expected.length,
    clean: counts.FAIL === 0 && counts.BLOCKED === 0 && counts.INFRA === 0,
    lanes: normalized,
    rootCauseGroups: [...groups.values()].map((group) => ({ ...group, statusSet: [...new Set(group.statusSet)], lanes: [...new Set(group.lanes)], domains: [...new Set(group.domains)] }))
  };
}

function main(argv = process.argv.slice(2)) {
  const dir = argv[0] || 'd200-results';
  const configIndex = argv.indexOf('--config');
  const outputIndex = argv.indexOf('--output');
  const enforce = argv.includes('--enforce');
  const configPath = configIndex >= 0 ? argv[configIndex + 1] : 'config/d200-bug-hunt-lanes.json';
  const outputPath = outputIndex >= 0 ? argv[outputIndex + 1] : 'd200-bug-hunt-aggregate.json';
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort() : [];
  const results = files.map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))).filter((value) => value?.schema === 'truyn.d200.bug-hunt.result.v1');
  const summary = aggregate({ config, results });
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`TRUYN_D200_BUG_HUNT_AGGREGATE pass=${summary.counts.PASS} fail=${summary.counts.FAIL} blocked=${summary.counts.BLOCKED} infra=${summary.counts.INFRA} clean=${summary.clean}`);
  if (enforce && !summary.clean) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
