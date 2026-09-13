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
  'core/security/sponsored-entitlement.js',
  'runtime/authority-service.js',
  'runtime/managed-billing-policy.js'
]);

// SPLIT paths are allowed to remain public, but managed implementation must not return.
const SPLIT_FORBIDDEN = new Map([
  ['core/security/provider-billing.js', [
    /signedEntitlementVerifier/,
    /sponsoredUsageStore/,
    /entitlementAuthority/,
    /accountingAuthority/,
    /\b(?:sponsored|prepaid|subscription)\b/
  ]],
  ['runtime/billing-config.js', [
    /authority-client\.js/,
    /managed-billing-policy\.js/,
    /TRUYN_AUTHORITY_/,
    /\b(?:sponsored|prepaid|subscription)\b/
  ]],
  ['runtime/authority-client.js', [
    /production-control-plane(?:-snapshot)?\.js/,
    /createProductionControlPlane/,
    /materializeProductionControlPlaneSnapshot/
  ]],
  ['runtime/production.js', [
    /authority-service\.js/,
    /createAuthorityServiceFromEnv/,
    /role\s*===\s*['\"]authority['\"]/
  ]]
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
    for (const pattern of SPLIT_FORBIDDEN.get(path) || []) {
      if (pattern.test(text)) {
        violations.push(`${path}: managed implementation leaked back into a public SPLIT surface (${pattern})`);
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
