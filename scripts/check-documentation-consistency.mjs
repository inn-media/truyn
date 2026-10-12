#!/usr/bin/env node
/** Read-only documentation/release reconciliation. No network, publishing or admission. */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ids = { typescript: 'npm', python: 'pypi', go: 'go', java: 'maven', dotnet: 'nuget' };
const normalize = value => String(value).replace(/^Truyn\.Sdk /, 'Truyn.Sdk@');
export function validateReleaseInventory(current, freeze, versions) {
  const errors = [];
  if (current.frozenSourceSha !== freeze.frozenSourceSha) errors.push('frozen release source mismatch');
  if (freeze.stableProtocolDeclared !== false || current.channel !== 'public-pre-release') errors.push('prerelease must not imply stable admission');
  if (freeze.coordinates.length !== 5 || Object.keys(current.coordinates).length !== 5) errors.push('exactly five SDKs required');
  for (const item of freeze.coordinates) {
    const key = ids[item.id], actual = current.coordinates[key];
    if (!actual || normalize(actual.coordinate) !== normalize(item.coordinate)) errors.push(`stale coordinate: ${item.id}`);
    if (actual?.publicationState !== 'accepted' || actual?.sourceSha !== freeze.frozenSourceSha) errors.push(`missing source/publication evidence: ${item.id}`);
    const expected = key === 'npm' ? versions.typescript : key === 'pypi' ? versions.python : key === 'go' ? versions.goTag.replace('sdk/go/', '') : versions.release;
    if (actual?.version !== expected) errors.push(`build/public release version mismatch: ${item.id}`);
  }
  return errors;
}

export function auditDocumentation(root) {
  const read = path => readFileSync(resolve(root, path), 'utf8');
  const json = path => JSON.parse(read(path));
  const current = json('sdk/release/public-coordinates.json');
  const freeze = json('spec/compatibility/truyn1-five-sdk-freeze.json');
  const errors = validateReleaseInventory(current, freeze, json('sdk/release/version.json'));
  const historyHash = createHash('sha256').update(readFileSync(resolve(root, current.historicalLedger))).digest('hex');
  if (historyHash !== current.historicalLedgerSha256) errors.push('historical coordinate ledger changed');
  const inventory = json('docs/compatibility/protocol-rc-documentation-inventory.json');
  if (inventory.stableProtocolDeclared !== false || inventory.mainnetAdmitted !== false) errors.push('documentation inventory cannot admit stable/mainnet');
  if (inventory.gates.map(x => x.id).join(',') !== Array.from({ length: 14 }, (_, i) => `P${i + 1}`).join(',')) errors.push('P1-P14 inventory incomplete');
  for (const gate of inventory.gates) {
    if (gate.normativeStatus !== 'DEFINED' || gate.executableStatus !== 'IMPLEMENTED') errors.push(`${gate.id}: distinguish definition/implementation from acceptance`);
    for (const path of [...gate.normativePaths, ...gate.executablePaths, gate.acceptanceRecord]) {
      if (!existsSync(resolve(root, path))) errors.push(`${gate.id}: missing evidence path ${path}`);
    }
  }
  // These complete current-reference documents contain no historical install tables.
  const currentOnly = ['docs/compatibility/SDK_COMPATIBILITY.md', 'docs/compatibility/SDK_PACKAGING.md', 'docs/getting-started/SDK_QUICKSTART.md', 'docs/getting-started/DX3_SDK.md'];
  const oldCoordinates = /@truyn\/sdk@0\.1\.0-alpha\.2\b|truyn-sdk==0\.1\.0a1\b|github\.com\/inn-media\/truyn\/sdk\/go@v0\.1\.0-alpha\.1\b|org\.truyn:truyn-sdk:0\.1\.0-alpha\.1\b|Truyn\.Sdk[ @]0\.1\.0-alpha\.1\b/;
  for (const path of currentOnly) if (oldCoordinates.test(read(path))) errors.push(`${path}: obsolete install coordinate in current reference`);
  for (const path of ['sdk/README.md', ...currentOnly]) {
    const text = read(path);
    for (const item of freeze.coordinates) {
      if (!text.includes(item.coordinate) && !text.includes(normalize(item.coordinate))) errors.push(`${path}: missing current ${item.id} coordinate`);
    }
    if (/Maven Central and NuGet(?:\.org)? (?:have not|remain below)|Java\/Maven Central and \.NET\/NuGet remain `false`/.test(text)) errors.push(`${path}: obsolete publication gate`);
  }
  const files = [...new Set(execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))];
  let markdownFiles = 0, localLinks = 0;
  for (const path of files.filter(p => /\.(?:md|mdx)$/i.test(p))) {
    markdownFiles++;
    let fence = false;
    for (const [index, line] of read(path).split('\n').entries()) {
      if (/^\s*(?:```|~~~)/.test(line)) { fence = !fence; continue; }
      if (fence) continue;
      for (const match of line.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
        const href = match[1].replace(/^<|>$/g, '');
        // GitHub host-relative issue/run links are not repository-local paths.
        if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/|\/inn-media\/)/i.test(href)) continue;
        const target = decodeURIComponent(href.split(/[?#]/, 1)[0]);
        if (!target) continue;
        localLinks++;
        const full = resolve(href.startsWith('/') ? root : dirname(resolve(root, path)), target.replace(/^\//, ''));
        if (relative(root, full).startsWith('..') || !existsSync(full)) errors.push(`${path}:${index + 1}: broken local link ${href}`);
      }
    }
  }
  return { schema: 'truyn.documentation-audit/v1', networkAccess: false, stableAdmission: false, markdownFiles, localLinks, errors, passed: errors.length === 0 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = auditDocumentation(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.passed ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
