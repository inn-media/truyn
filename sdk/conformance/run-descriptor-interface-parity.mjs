#!/usr/bin/env node
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, resolve, join, delimiter } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createIdentity, signValue } from '../../core/identity/index.js';
import { writeDescriptorParityReport } from './descriptor-report-output.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const languages = Object.freeze(['typescript', 'python', 'go', 'java', 'dotnet']);
export const fixturePath = 'sdk/conformance/v1/agent-descriptor-interface-fixtures.json';
export function inspectSourceState(cwd = root) {
  // Toolchains compile untracked source too. Ignore only actual .gitignore
  // outputs, not all untracked paths, and observe both sides of execution.
  return {
    sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(),
    clean: execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd, encoding: 'utf8' }).trim() === ''
  };
}
export function sourceStateQualified(before, after) {
  return before.clean === true && after.clean === true && before.sourceSha === after.sourceSha;
}
export function loadCases() { return JSON.parse(readFileSync(resolve(root, fixturePath), 'utf8')).cases; }
export function signedCase(item, identity, now = Date.now()) {
  const unsigned = { schema: 'truyn.agent-descriptor/v1', descriptorVersion: '1', identity: identity.nodeId,
    protocols: ['TRUYN/1'], interfaces: structuredClone(item.interfaces), capabilities: [],
    issuedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 1800000).toISOString() };
  let signature = signValue(unsigned, identity.privateKeyPem);
  if (item.tamperSignature) { const bytes = Buffer.from(signature, 'base64'); bytes[32] ^= 1; signature = bytes.toString('base64'); }
  return { ...unsigned, signature };
}
export function validateResults(cases, reports, requests, identity) {
  assert.deepEqual(Object.keys(reports).sort(), [...languages].sort(), 'all five independent SDK results required');
  const ids = cases.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate fixture IDs');
  for (const language of languages) {
    const rows = reports[language];
    assert.ok(Array.isArray(rows), `${language}: missing native result array`);
    assert.deepEqual(rows.map(r => r.id).sort(), [...ids].sort(), `${language}: exact case set`);
    for (const item of cases) {
      const row = rows.find(r => r.id === item.id);
      assert.equal(requests[`${language}/${item.id}`], 1, `${language}/${item.id}: one real HTTP fetch required`);
      assert.equal(row.ok, item.ok, `${language}/${item.id}: ${row.message ?? 'unexpected acceptance'}`);
      if (item.ok) {
        assert.equal(row.identity, identity, `${language}/${item.id}: identity`);
        assert.equal(row.protocol, 'TRUYN/1'); assert.equal(row.keyBinding, 'identity');
        assert.deepEqual(row.interface, item.interfaces[0], `${language}/${item.id}: selection must preserve optional fields`);
      } else {
        assert.match(row.message ?? '', item.tamperSignature ? /signature/i : /interfaces/i,
          `${language}/${item.id}: must fail for intended validation, not network, expiry or unrelated error`);
      }
    }
  }
}
function run(command, args, env, cwd = root) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit', shell: false });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${command}: conformance timeout`)); }, 180000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', (code, signal) => { clearTimeout(timer); code === 0 ? resolveRun() : reject(new Error(`${command}: ${signal ?? code}`)); });
  });
}
export async function runDescriptorInterfaceParity() {
  const sourceBefore = inspectSourceState();
  const cases = loadCases(), identity = createIdentity(), directory = mkdtempSync(join(tmpdir(), 'truyn-descriptor-parity-'));
  const documents = new Map(cases.map(c => [c.id, signedCase(c, identity)]));
  const requests = {}, reports = {}, errors = [];
  const server = http.createServer((req, res) => {
    const parts = (req.url ?? '').split('/');
    const language = parts[1], id = parts[2];
    if (req.method !== 'GET' || parts.length !== 3 || !languages.includes(language) || !documents.has(id)) { res.writeHead(404).end(); return; }
    const key = `${language}/${id}`; requests[key] = (requests[key] ?? 0) + 1;
    const body = JSON.stringify(documents.get(id));
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }); res.end(body);
  });
  try {
    await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const jobs = languages.map(async language => {
      const input = join(directory, `${language}-input.json`), output = join(directory, `${language}-result.json`);
      writeFileSync(input, JSON.stringify({ baseUrl, publicKeyPem: identity.publicKeyPem, supportedInterfaces: ['https', 'websocket', 'truyn-quic', 'mcp', ' '],
        cases: cases.map(c => ({ id: c.id, url: `${baseUrl}/${language}/${c.id}` })) }));
      const env = { TRUYN_DESCRIPTOR_CASES_FILE: input, TRUYN_DESCRIPTOR_RESULT_FILE: output,
        PYTHONPATH: resolve(root, 'sdk/python/src') + (process.env.PYTHONPATH ? delimiter + process.env.PYTHONPATH : '') };
      try {
        if (language === 'typescript') await run(process.execPath, ['--experimental-strip-types', 'sdk/typescript/test/descriptor-interface-conformance.ts'], env);
        if (language === 'python') await run('python', ['sdk/python/tests/descriptor_interface_conformance.py'], env);
        if (language === 'go') await run('go', ['test', './...', '-run', '^TestDescriptorInterfaceParity$', '-count=1', '-v'], env, resolve(root, 'sdk/go'));
        if (language === 'java') {
          await run('mvn', ['-q', '-f', 'sdk/java/pom.xml', 'test-compile'], env);
          await run('java', ['-cp', `sdk/java/target/classes${delimiter}sdk/java/target/test-classes`, 'org.truyn.sdk.DescriptorInterfaceConformance'], env);
        }
        if (language === 'dotnet') await run('dotnet', ['run', '--configuration', 'Release', '--project', 'sdk/dotnet/conformance/Truyn.Sdk.Conformance.csproj', '--', '--descriptor-interfaces'], env);
        reports[language] = JSON.parse(readFileSync(output, 'utf8'));
      } catch (error) { errors.push(`${language}: ${error.message}`); }
    });
    await Promise.all(jobs);
    let passed = errors.length === 0;
    try { validateResults(cases, reports, requests, identity.nodeId); } catch (error) { passed = false; errors.push(error.message); }
    const sourceAfter = inspectSourceState();
    const workingTreeClean = sourceStateQualified(sourceBefore, sourceAfter);
    const digest = value => createHash('sha256').update(value).digest('hex');
    const report = { schema: 'truyn.descriptor-interface-parity/v1', scope: 'bounded-source-sdk-interface-parity',
      sourceSha: sourceBefore.sourceSha, sourceShaAfter: sourceAfter.sourceSha,
      sourceBefore, sourceAfter, workingTreeClean, exactSourceQualified: passed && workingTreeClean,
      fixtureSha256: digest(readFileSync(resolve(root, fixturePath))),
      caseIds: cases.map(c => c.id), signedDocumentSha256: Object.fromEntries([...documents].map(([id, doc]) => [id, digest(JSON.stringify(doc))])),
      requests, results: reports, errors, passed, stableAdmission: false, publishedPackageUpgrade: false, paidProviderCalls: 0 };
    if (process.env.TRUYN_DESCRIPTOR_PARITY_REPORT) writeDescriptorParityReport(root, process.env.TRUYN_DESCRIPTOR_PARITY_REPORT, report);
    console.log('DESCRIPTOR_INTERFACE_PARITY_REPORT=' + JSON.stringify(report));
    if (!passed) throw new Error('five-SDK Descriptor interface parity failed');
    console.log(`PASS Agent Descriptor interface parity: ${languages.length} SDKs x ${cases.length} shared cases`);
    return report;
  } finally {
    server.closeAllConnections(); await new Promise(ok => server.close(ok));
    rmSync(directory, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runDescriptorInterfaceParity();
}
