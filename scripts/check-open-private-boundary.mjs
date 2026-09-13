#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const MIGRATED_PRIVATE_PATHS = new Set([
  'core/security/account-tenant-authority.js',
  'core/security/accounted-execution.js',
  'core/security/cosmos-authority-checkpoint.js',
  'core/security/durable-account-tenant-authority.js',
  'core/security/durable-accounting-authority.js',
  'core/security/entitlement-authority.js',
  'core/security/managed-production-authority.js',
  'core/security/production-control-plane-snapshot.js',
  'core/security/production-control-plane.js',
  'core/security/production-revocation-authority.js',
  'core/security/provider-billing.js',
  'core/security/provider-grant-authority.js',
  'core/security/sponsored-entitlement.js',
  'runtime/authority-client.js',
  'runtime/authority-service.js',
  'runtime/billing-config.js',
  'runtime/managed-billing-policy.js',
  'runtime/production.js',
  'runtime/relay-authority-runtime.js'
]);

const CODE_PREFIXES = ['core/', 'runtime/', 'sdk/', 'tests/', 'scripts/', '.github/workflows/'];
const CODE_ROOT_FILES = new Set(['package.json', 'package-lock.json']);
const SELF = 'scripts/check-open-private-boundary.mjs';
const FORBIDDEN_COUPLING = [
  /inn-media\/truyn-platform/i,
  /(?:^|["'`\s:(])\.\.\/truyn(?:\/|["'`\s),]|$)/i,
  /raw\.githubusercontent\.com\/inn-media\/truyn-platform/i,
  /github\.com[/:]inn-media\/truyn-platform(?:\.git)?/i
];

export function violationsFor(paths, readText = (p) => readFileSync(p, 'utf8')) {
  const violations = [];
  const tracked = new Set(paths);

  for (const path of MIGRATED_PRIVATE_PATHS) {
    if (tracked.has(path)) violations.push(`${path}: classified managed/private implementation must remain outside the public repository`);
  }

  for (const path of paths) {
    if (path === SELF) continue;
    if (!CODE_ROOT_FILES.has(path) && !CODE_PREFIXES.some((prefix) => path.startsWith(prefix))) continue;
    let text;
    try { text = readText(path); } catch { continue; }
    for (const pattern of FORBIDDEN_COUPLING) {
      if (pattern.test(text)) {
        violations.push(`${path}: forbidden public -> private/raw-source coupling (${pattern})`);
        break;
      }
    }
  }

  return violations;
}

export function currentPaths() {
  return execFileSync('git', ['ls-files'], {encoding: 'utf8'}).trim().split('\n').filter(Boolean);
}

export function main() {
  const violations = violationsFor(currentPaths());
  if (violations.length) throw new Error(`TRUYN open/private boundary violations:\n${violations.join('\n')}`);
  console.log('TRUYN_OPEN_PRIVATE_BOUNDARY=PASS');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
