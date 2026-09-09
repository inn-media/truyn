#!/usr/bin/env node

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { hasAuthorSignOff } from './check-dco.mjs';

function authorEmail(commit) { return String(commit?.commit?.author?.email ?? '').trim(); }
function hasCanonicalAuthorDco(commit) { return hasAuthorSignOff(commit?.commit?.message ?? '', authorEmail(commit)); }

export function validateTestedSourceCommit(commit, mergedHead) {
  if (!commit || typeof commit !== 'object') throw new Error('missing tested commit metadata');
  if (hasCanonicalAuthorDco(commit)) return { mode: 'direct-author-signed-off' };
  const parents = Array.isArray(commit.parents) ? commit.parents : [];
  if (parents.length !== 2) throw new Error('tested source without author-matching DCO must be an exact two-parent GitHub merge');
  if (commit.commit?.verification?.verified !== true) throw new Error('tested GitHub merge must be cryptographically verified');
  if (commit.committer?.login !== 'web-flow') throw new Error('tested merge must be created by GitHub web-flow');
  if (!/^Merge pull request #\d+ from /m.test(String(commit.commit?.message ?? ''))) throw new Error('tested merge must have canonical GitHub merge message');
  if (!mergedHead || mergedHead.sha !== parents[1]?.sha) throw new Error('merged PR head must equal second parent of tested merge');
  if (!hasCanonicalAuthorDco(mergedHead)) throw new Error('merged PR head must contain an author-matching Signed-off-by trailer');
  return { mode: 'verified-github-merge-with-author-signed-head', mergedHeadSha: mergedHead.sha };
}

export function main(argv = process.argv.slice(2)) {
  const [commitPath, mergedHeadPath] = argv;
  if (!commitPath || argv.length > 2) { console.error('Usage: node scripts/validate-d200-tested-source-dco.mjs <tested-commit.json> [merged-head.json]'); process.exitCode = 2; return; }
  try {
    const commit = JSON.parse(fs.readFileSync(commitPath, 'utf8'));
    const mergedHead = mergedHeadPath ? JSON.parse(fs.readFileSync(mergedHeadPath, 'utf8')) : undefined;
    console.log(JSON.stringify(validateTestedSourceCommit(commit, mergedHead)));
  } catch (error) {
    console.error(`TRUYN_D200_SOURCE_DCO_REJECTED ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) main();
