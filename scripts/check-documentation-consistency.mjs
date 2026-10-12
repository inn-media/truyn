#!/usr/bin/env node
/** Read-only documentation/release reconciliation. No network, publishing or admission. */
import { readFileSync, existsSync, statSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ids = Object.freeze({ typescript: 'npm', python: 'pypi', go: 'go', java: 'maven', dotnet: 'nuget' });
const normalize = value => String(value).replace(/^Truyn\.Sdk /, 'Truyn.Sdk@');
const text = value => typeof value === 'string' && value.trim().length > 0;
const outside = rel => rel === '..' || /^\.\.[\\/]/.test(rel) || isAbsolute(rel);
const exactSet = (actual, expected) => Array.isArray(actual) && actual.length === expected.length && new Set(actual).size === expected.length && expected.every(id => actual.includes(id));
const certificate = 'docs/compatibility/TRUYN1_P1_P5_JOINT_RC_CERTIFICATION.md';
const pendingRecord = 'docs/compatibility/TRUYN1_RC_GAP_LEDGER.md';
// Reviewed bounded acceptance snapshot, not a permanent prohibition on progression.
// A later promotion must update this policy AND its independently accepted evidence.
const acceptedGates = Object.freeze({
  P1: ['BOUNDED_RC_ACCEPTED', certificate], P2: ['BOUNDED_RC_ACCEPTED', certificate],
  P3: ['BOUNDED_RC_ACCEPTED', certificate], P4: ['BOUNDED_RC_ACCEPTED', certificate],
  P5: ['BOUNDED_REGISTRATION_RC_ACCEPTED', certificate],
  P6: ['QUALIFICATION_PENDING', pendingRecord], P7: ['QUALIFICATION_PENDING', pendingRecord],
  P8: ['QUALIFICATION_PENDING', pendingRecord], P9: ['QUALIFICATION_PENDING', pendingRecord],
  P10: ['BOUNDED_ERROR_PARITY_ACCEPTED', 'docs/compatibility/P10_ERROR_PARITY_ACCEPTANCE_2026-10-12.md'],
  P11: ['QUALIFICATION_PENDING', pendingRecord],
  P12: ['BOUNDED_REFERENCE_PROFILE_RECORDED', 'docs/compatibility/TRUYN1_P12_OBJECT_ARTIFACT_CERTIFICATION.md'],
  P13: ['FORMAT_PRE_STABLE_OPS_BLOCKED', 'docs/compatibility/P13_FORMAT_COMPATIBILITY.md'],
  P14: ['STABLE_ADMISSION_OPEN', pendingRecord]
});

export function validateReleaseInventory(current, freeze, versions) {
  const errors = [];
  const coordinates = Array.isArray(freeze?.coordinates) ? freeze.coordinates : [];
  const published = current?.coordinates && typeof current.coordinates === 'object' && !Array.isArray(current.coordinates) ? current.coordinates : {};
  if (!exactSet(coordinates.map(item => item?.id), Object.keys(ids))) errors.push('exactly five distinct required SDK IDs are required');
  if (!exactSet(Object.keys(published), Object.values(ids))) errors.push('exactly five required registry keys are required');
  if (!text(current?.frozenSourceSha) || current.frozenSourceSha !== freeze?.frozenSourceSha) errors.push('frozen release source mismatch');
  if (freeze?.stableProtocolDeclared !== false || current?.channel !== 'public-pre-release') errors.push('prerelease must not imply stable admission');
  if (!text(current?.releaseEvidence)) errors.push('missing current release evidence pointer');
  for (const [id, key] of Object.entries(ids)) {
    const item = coordinates.find(item => item?.id === id), actual = published[key];
    if (!item || !actual || !text(actual.coordinate) || normalize(actual.coordinate) !== normalize(item.coordinate)) errors.push(`stale coordinate: ${id}`);
    if (actual?.publicationState !== 'accepted' || actual?.sourceSha !== freeze?.frozenSourceSha) errors.push(`missing source/publication evidence: ${id}`);
    if (!text(actual?.evidence) || actual.evidence !== current?.releaseEvidence) errors.push(`missing or mismatched release evidence pointer: ${id}`);
    const expected = key === 'npm' ? versions?.typescript : key === 'pypi' ? versions?.python : key === 'go' ? versions?.goTag?.replace('sdk/go/', '') : versions?.release;
    if (!text(expected) || actual?.version !== expected) errors.push(`build/public release version mismatch: ${id}`);
  }
  return errors;
}

export function validateProtocolInventory(inventory) {
  const errors = [], gates = Array.isArray(inventory?.gates) ? inventory.gates : [];
  if (inventory?.stableProtocolDeclared !== false || inventory?.mainnetAdmitted !== false) errors.push('documentation inventory cannot admit stable/mainnet');
  if (!exactSet(gates.map(gate => gate?.id), Object.keys(acceptedGates))) errors.push('P1-P14 inventory incomplete or duplicated');
  for (const gate of gates) {
    const expected = acceptedGates[gate?.id];
    if (!expected || gate.acceptanceStatus !== expected[0]) errors.push(`${gate?.id}: unqualified acceptance status change`);
    if (!expected || gate.acceptanceRecord !== expected[1]) errors.push(`${gate?.id}: acceptance record does not match reviewed scope`);
    if (gate?.normativeStatus !== 'DEFINED' || gate?.executableStatus !== 'IMPLEMENTED') errors.push(`${gate?.id}: distinguish definition/implementation from acceptance`);
    for (const field of ['normativePaths', 'executablePaths']) {
      if (!Array.isArray(gate?.[field]) || gate[field].length === 0 || !gate[field].every(text)) errors.push(`${gate?.id}: empty or malformed ${field}`);
    }
  }
  return errors;
}

export function validateEvidencePaths(root, entries) {
  const errors = [], realRoot = realpathSync(root);
  for (const { label, path } of entries) {
    if (!text(path) || isAbsolute(path) || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
      errors.push(`${label}: missing or non-local evidence path`); continue;
    }
    const full = resolve(root, path), rel = relative(resolve(root), full);
    if (outside(rel)) {
      errors.push(`${label}: evidence path escapes repository`); continue;
    }
    try {
      const realFile = realpathSync(full);
      if (outside(relative(realRoot, realFile))) {
        errors.push(`${label}: evidence resolves outside repository ${path}`); continue;
      }
      if (!statSync(realFile).isFile()) errors.push(`${label}: evidence path is not a file ${path}`);
    }
    catch { errors.push(`${label}: missing evidence file ${path}`); }
  }
  return errors;
}

export function auditDocumentation(root) {
  const read = path => readFileSync(resolve(root, path), 'utf8');
  const json = path => JSON.parse(read(path));
  const current = json('sdk/release/public-coordinates.json');
  const freeze = json('spec/compatibility/truyn1-five-sdk-freeze.json');
  const inventory = json('docs/compatibility/protocol-rc-documentation-inventory.json');
  const errors = [...validateReleaseInventory(current, freeze, json('sdk/release/version.json')), ...validateProtocolInventory(inventory)];
  const evidence = [
    { label: 'current release', path: current.releaseEvidence },
    { label: 'historical coordinates', path: current.historicalLedger },
    ...Object.values(ids).map(key => ({ label: key, path: current.coordinates?.[key]?.evidence }))
  ];
  for (const gate of Array.isArray(inventory.gates) ? inventory.gates : []) {
    const paths = [...(Array.isArray(gate.normativePaths) ? gate.normativePaths : []), ...(Array.isArray(gate.executablePaths) ? gate.executablePaths : []), gate.acceptanceRecord];
    evidence.push(...paths.map(path => ({ label: gate.id, path })));
  }
  errors.push(...validateEvidencePaths(root, evidence));
  if (validateEvidencePaths(root, [{ label: 'history', path: current.historicalLedger }]).length === 0) {
    const historyHash = createHash('sha256').update(readFileSync(resolve(root, current.historicalLedger))).digest('hex');
    if (historyHash !== current.historicalLedgerSha256) errors.push('historical coordinate ledger changed');
  }
  const currentOnly = ['docs/compatibility/SDK_COMPATIBILITY.md', 'docs/compatibility/SDK_PACKAGING.md', 'docs/getting-started/SDK_QUICKSTART.md', 'docs/getting-started/DX3_SDK.md'];
  const oldCoordinates = /@truyn\/sdk@0\.1\.0-alpha\.2\b|truyn-sdk==0\.1\.0a1\b|github\.com\/inn-media\/truyn\/sdk\/go@v0\.1\.0-alpha\.1\b|org\.truyn:truyn-sdk:0\.1\.0-alpha\.1\b|Truyn\.Sdk[ @]0\.1\.0-alpha\.1\b/;
  for (const path of currentOnly) if (oldCoordinates.test(read(path))) errors.push(`${path}: obsolete install coordinate in current reference`);
  for (const path of ['sdk/README.md', ...currentOnly]) {
    const contents = read(path);
    for (const item of Array.isArray(freeze.coordinates) ? freeze.coordinates : []) {
      if (!contents.includes(item.coordinate) && !contents.includes(normalize(item.coordinate))) errors.push(`${path}: missing current ${item.id} coordinate`);
    }
    if (/Maven Central and NuGet(?:\.org)? (?:have not|remain below)|Java\/Maven Central and \.NET\/NuGet remain `false`/.test(contents)) errors.push(`${path}: obsolete publication gate`);
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
        if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/|\/inn-media\/)/i.test(href)) continue;
        let target;
        try { target = decodeURIComponent(href.split(/[?#]/, 1)[0]); }
        catch { errors.push(`${path}:${index + 1}: malformed local link ${href}`); continue; }
        if (!target) continue;
        localLinks++;
        const full = resolve(href.startsWith('/') ? root : dirname(resolve(root, path)), target.replace(/^\//, ''));
        const rel = relative(root, full);
        if (outside(rel) || !existsSync(full)) errors.push(`${path}:${index + 1}: broken local link ${href}`);
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
