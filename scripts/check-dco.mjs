#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SIGN_OFF_RE = /^Signed-off-by:\s*(.+?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/gim;

export function parseSignOffs(message) {
  const text = String(message ?? '');
  const signOffs = [];
  for (const match of text.matchAll(SIGN_OFF_RE)) {
    signOffs.push({
      name: match[1].trim(),
      email: match[2].trim()
    });
  }
  return signOffs;
}

export function hasAuthorSignOff(message, authorEmail) {
  const normalizedAuthorEmail = String(authorEmail ?? '').trim().toLowerCase();
  if (!normalizedAuthorEmail) return false;
  return parseSignOffs(message).some(({ email }) => email.toLowerCase() === normalizedAuthorEmail);
}

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trimEnd();
}

function assertCommitish(value, label) {
  if (!/^[0-9a-f]{7,40}$/i.test(String(value ?? ''))) {
    throw new Error(`${label} must be a Git commit SHA`);
  }
  git(['rev-parse', '--verify', `${value}^{commit}`]);
}

export function checkRange(baseSha, headSha) {
  assertCommitish(baseSha, 'base SHA');
  assertCommitish(headSha, 'head SHA');

  const range = `${baseSha}..${headSha}`;
  const output = git(['rev-list', '--reverse', range]);
  const commits = output ? output.split('\n').filter(Boolean) : [];

  if (commits.length === 0) {
    throw new Error(`DCO check found no contribution commits in ${range}`);
  }

  const failures = [];

  for (const sha of commits) {
    const authorName = git(['show', '-s', '--format=%an', sha]);
    const authorEmail = git(['show', '-s', '--format=%ae', sha]);
    const message = git(['show', '-s', '--format=%B', sha]);

    if (!hasAuthorSignOff(message, authorEmail)) {
      failures.push({ sha, authorName, authorEmail });
    }
  }

  if (failures.length > 0) {
    const details = failures
      .map(({ sha, authorName, authorEmail }) => `- ${sha.slice(0, 12)} ${authorName} <${authorEmail}>`)
      .join('\n');

    throw new Error(
      `DCO 1.1 check failed. Every contribution commit must contain a Signed-off-by trailer whose email matches the commit author.\n\n${details}\n\nFix the latest commit with:\n  git commit --amend --signoff --no-edit\n\nFor multiple commits, add a sign-off to every contribution commit (for example with an appropriate interactive rebase or git rebase --signoff). See CONTRIBUTING.md and DCO.`
    );
  }

  return commits;
}

export function main(argv = process.argv.slice(2)) {
  const [baseSha, headSha] = argv;
  if (!baseSha || !headSha || argv.length !== 2) {
    console.error('Usage: node scripts/check-dco.mjs <base-sha> <head-sha>');
    process.exitCode = 2;
    return;
  }

  try {
    const commits = checkRange(baseSha, headSha);
    console.log(`DCO 1.1 PASS: ${commits.length} contribution commit(s) have author-matching Signed-off-by trailers.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) main();
