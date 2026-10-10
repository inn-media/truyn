#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const paths = execFileSync('git', ['ls-files', '-z'], { maxBuffer: 20 * 1024 * 1024 })
  .toString('utf8').split('\0').filter(Boolean);
const textExt = new Set(['.md', '.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.txt', '.sh', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.proto']);
const hashes = new Map();
const counts = {};
const duplicateContentGroups = [];
const suspicious = [];
const patterns = [
  { id: 'outdated_d5000_attempt3_current', re: /D-5000.{0,120}Attempt 3.{0,100}(in progress|current)/i },
  { id: 'outdated_n_no_execution', re: /N-Series.{0,100}(NOT YET EXECUTED|no N-Series run has executed)/i },
  { id: 'old_open1_sprint', re: /S01.?S102.{0,120}S103 active/i },
  { id: 'old_maven_pending', re: /Maven Central publication evidence;|Maven Central.{0,80}remain.{0,80}closure gates/i },
];
for (const path of paths) {
  const top = path.split('/')[0];
  counts[top] = (counts[top] ?? 0) + 1;
  const bytes = readFileSync(path);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const prior = hashes.get(hash);
  if (prior && bytes.length >= 128) duplicateContentGroups.push([prior, path]);
  else hashes.set(hash, path);
  if (!textExt.has(extname(path)) || bytes.length > 1024 * 1024) continue;
  const text = bytes.toString('utf8');
  const matches = patterns.filter(x => x.re.test(text)).map(x => x.id);
  if (matches.length) suspicious.push({ path, matches, historical: /(?:history|evidence|dated|archive|attempt|sanitation)/i.test(path) });
}
const result = {
  schema: 'truyn.repository.inventory/v1',
  trackedFiles: paths.length,
  topLevelCounts: counts,
  byteIdenticalPairs: duplicateContentGroups,
  statusReviewCandidates: suspicious,
  note: 'A candidate is not proof of obsolescence. Historical evidence and tests must never be auto-deleted.'
};
console.log('REPOSITORY_INVENTORY=' + JSON.stringify(result));
