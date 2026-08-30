#!/usr/bin/env node
import http from 'node:http';
import { spawn } from 'node:child_process';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIdentity, signValue } from '../../core/identity/index.js';
import { createRelay } from '../../network/relay/server.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...(options.env ?? {}) },
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

const relay = createRelay({ localDevelopmentMode: true });
const relayUrl = await relay.listen({ port: 0 });
const fixture = await descriptorFixture();
const descriptorEnv = {
  TRUYN_CONFORMANCE_DESCRIPTOR_URL: fixture.url,
  TRUYN_CONFORMANCE_DESCRIPTOR_PUBLIC_KEY: fixture.publicKeyPem,
  TRUYN_CONFORMANCE_DESCRIPTOR_IDENTITY: fixture.identity
};
try {
  await run(process.execPath, ['--experimental-strip-types', 'sdk/typescript/test/release-conformance.ts', relayUrl], { env: descriptorEnv });
  await run('python', ['sdk/python/tests/release_conformance.py', relayUrl], { env: descriptorEnv });
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
  process.stdout.write('PASS five-language executable conformance including signed Agent Descriptor lifecycle\n');
} finally {
  await fixture.close();
  await relay.close();
}
