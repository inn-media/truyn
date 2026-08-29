#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const relay = createRelay({ localDevelopmentMode: true });
const relayUrl = await relay.listen({ port: 0 });
try {
  await run(process.execPath, ['--experimental-strip-types', 'sdk/typescript/test/release-conformance.ts', relayUrl]);
  await run('python', ['sdk/python/tests/release_conformance.py', relayUrl]);
  await run('go', ['test', './...', '-run', 'TestDeveloperReleaseConformance', '-count=1'], {
    cwd: resolve(repoRoot, 'sdk/go'),
    env: { TRUYN_CONFORMANCE_RELAY: relayUrl }
  });
  await run('mvn', ['-q', '-f', 'sdk/java/pom.xml', 'test-compile']);
  await run('java', [
    '-cp',
    `sdk/java/target/classes${delimiter}sdk/java/target/test-classes`,
    'org.truyn.sdk.ConformanceMain',
    relayUrl
  ]);
  await run('dotnet', ['run', '--configuration', 'Release', '--project', 'sdk/dotnet/conformance/Truyn.Sdk.Conformance.csproj', '--', relayUrl]);
  process.stdout.write('PASS five-language executable conformance\n');
} finally {
  await relay.close();
}
