#!/usr/bin/env node
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createSqliteLifecycleLedger } from '../../network/relay/durable-lifecycle-ledger.js';
import { delimiter, dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIdentity, signValue } from '../../core/identity/index.js';
import { createRelay } from '../../network/relay/server.js';
import { conformanceEnvironment } from './descriptor-qualification-policy.mjs';
conformanceEnvironment(); // Fail before relay creation or native commands on injected flags.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: conformanceEnvironment({ ...process.env, ...(options.env ?? {}) }),
      stdio: 'inherit',
      shell: false
    });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} ${args.join(' ')} failed with ${signal ? `signal ${signal}` : `exit ${code}`}`));
    });
  });
}

async function descriptorFixture() {
  const identity = createIdentity();
  let descriptor = null;
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/.well-known/truyn-agent.json' || !descriptor) {
      res.writeHead(404).end();
      return;
    }
    const body = JSON.stringify(descriptor);
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
    res.end(body);
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/.well-known/truyn-agent.json`;
  const now = Date.now();
  const unsigned = {
    schema: 'truyn.agent-descriptor/v1',
    descriptorVersion: '1',
    identity: identity.nodeId,
    protocols: ['TRUYN/1'],
    interfaces: [{ type: 'https', endpoint: url }],
    capabilities: [{ id: 'reasoning.general' }],
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 10 * 60_000).toISOString()
  };
  descriptor = { ...unsigned, signature: signValue(unsigned, identity.privateKeyPem) };
  return {
    url,
    publicKeyPem: identity.publicKeyPem,
    identity: identity.nodeId,
    close: () => new Promise((resolveClose) => server.close(resolveClose))
  };
}

const ledgerDir = mkdtempSync(join(tmpdir(), 'truyn-sdk-g5-'));
const lifecycleLedger = createSqliteLifecycleLedger({ filePath: join(ledgerDir,'lifecycle.sqlite') });
const relay = createRelay({ localDevelopmentMode: true, lifecycleLedger });
const relayUrl = await relay.listen({ port: 0 });
const fixture = await descriptorFixture();
const descriptorEnv = {
  TRUYN_CONFORMANCE_DESCRIPTOR_URL: fixture.url,
  TRUYN_CONFORMANCE_DESCRIPTOR_PUBLIC_KEY: fixture.publicKeyPem,
  TRUYN_CONFORMANCE_DESCRIPTOR_IDENTITY: fixture.identity
};
try {
  // One RC qualification invocation must cover the bounded P1-P5 runtime
  // and shared vectors before testing all five independent SDK consumers.
  await run(process.execPath, ['--test',
    'tests/protocol-v1-rc.test.js',
    'tests/protocol-v1-registration-freshness.test.js',
    'tests/wire-freeze-crosslanguage-fixtures.test.js',
    'tests/wire-freeze-tcj1-negative.test.js'
  ]);
  await run(process.execPath, ['--experimental-strip-types', 'sdk/typescript/test/release-conformance.ts', relayUrl], { env: descriptorEnv });
  await run('python', ['sdk/python/tests/release_conformance.py', relayUrl], { env: descriptorEnv });
  await run('python', ['-m', 'unittest', 'discover', '-s', 'sdk/python/tests', '-p', 'test_tcj1_wire_freeze.py']);
  await run('go', ['test', './...', '-run', 'TestDeveloperReleaseConformance', '-count=1'], {
    cwd: resolve(repoRoot, 'sdk/go'),
    env: { TRUYN_CONFORMANCE_RELAY: relayUrl, ...descriptorEnv }
  });
  await run('mvn', ['-q', '-f', 'sdk/java/pom.xml', 'test-compile']);
  await run('java', [
    '-cp',
    `sdk/java/target/classes${delimiter}sdk/java/target/test-classes`,
    'org.truyn.sdk.ConformanceMain',
    relayUrl
  ], { env: descriptorEnv });
  await run('dotnet', ['run', '--configuration', 'Release', '--project', 'sdk/dotnet/conformance/Truyn.Sdk.Conformance.csproj', '--', relayUrl], { env: descriptorEnv });
  await run(process.execPath, ['sdk/conformance/quic-dht/run-dotnet.mjs']);
  // Five actual first-party native QUIC/UDP stacks; no reference-runtime proxy.
  await run('python', ['-m', 'pip', 'install', '--quiet', '-e', './sdk/python[quic]']);
  await run(process.execPath, ['sdk/conformance/quic-dht/run-python.mjs']);
  await run(process.execPath, ['sdk/conformance/quic-dht/run-typescript.mjs']);
  await run(process.execPath, ['sdk/conformance/quic-dht/run-go.mjs']);
  await run(process.execPath, ['sdk/conformance/quic-dht/run-java.mjs']);
  await run(process.execPath, ['sdk/conformance/run-descriptor-interface-parity.mjs']);
  // Mandatory 80 registry entries × five real first-party language runtimes.
  await run(process.execPath, ['sdk/conformance/core-registry/run.mjs']);
  process.stdout.write('PASS five-language executable conformance including signed Agent Descriptor lifecycle\n');
} finally {
  await fixture.close();
  await relay.close();
  lifecycleLedger.close();
  rmSync(ledgerDir,{recursive:true,force:true});
}
