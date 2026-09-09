#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

function hasDco(message) {
  return /(^|\n)Signed-off-by:\s+.+<[^>]+>\s*($|\n)/m.test(String(message || ''));
}

function validateTestedSourceCommit(commit, mergedHead) {
  if (!commit || typeof commit !== 'object') throw new Error('missing tested commit metadata');
  const message = commit.commit?.message || '';
  if (hasDco(message)) return { mode: 'direct-signed-off' };
  const parents = Array.isArray(commit.parents) ? commit.parents : [];
  if (parents.length !== 2) throw new Error('tested source without DCO must be an exact two-parent GitHub merge');
  if (commit.commit?.verification?.verified !== true) throw new Error('tested GitHub merge must be cryptographically verified');
  if (commit.committer?.login !== 'web-flow') throw new Error('tested merge must be created by GitHub web-flow');
  if (!/^Merge pull request #\d+ from /m.test(message)) throw new Error('tested merge must have canonical GitHub merge message');
  if (!mergedHead || mergedHead.sha !== parents[1]?.sha) throw new Error('merged PR head must equal second parent of tested merge');
  if (!hasDco(mergedHead.commit?.message)) throw new Error('merged PR head must contain Signed-off-by trailer');
  return { mode: 'verified-github-merge-with-signed-head', mergedHeadSha: mergedHead.sha };
}

module.exports = { hasDco, validateTestedSourceCommit };

if (require.main === module) {
  const [commitPath, mergedHeadPath] = process.argv.slice(2);
  if (!commitPath) process.exit(2);
  try {
    const commit = JSON.parse(fs.readFileSync(commitPath, 'utf8'));
    const mergedHead = mergedHeadPath ? JSON.parse(fs.readFileSync(mergedHeadPath, 'utf8')) : undefined;
    process.stdout.write(`${JSON.stringify(validateTestedSourceCommit(commit, mergedHead))}\n`);
  } catch (error) {
    console.error(`TRUYN_D200_SOURCE_DCO_REJECTED ${error.message}`);
    process.exit(1);
  }
}
