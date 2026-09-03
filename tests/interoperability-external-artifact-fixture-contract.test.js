import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const PACKAGE_URL = new URL('../package.json', import.meta.url);
const FIXTURES = [
  {
    label: 'A2A',
    url: new URL('./fixtures/official-a2a-sdk-artifact-server.mjs', import.meta.url),
    packageName: '@a2a-js/sdk',
    expectedVersion: '1.0.1'
  },
  {
    label: 'MCP',
    url: new URL('./fixtures/official-mcp-sdk-artifact-server.mjs', import.meta.url),
    packageName: '@modelcontextprotocol/server',
    expectedVersion: '2.0.0'
  }
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startFixture(fixture) {
  const child = spawn(process.execPath, [fileURLToPath(fixture.url)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  const ready = await new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`${fixture.label} fixture ready timeout: ${stderr}`)), 10_000);
    const fail = (error) => {
      clearTimeout(timer);
      reject(error);
    };
    child.once('error', fail);
    child.once('exit', (code, signal) => fail(new Error(`${fixture.label} fixture exited before ready (code=${code}, signal=${signal}): ${stderr}`)));
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      while (buffer.includes('\n')) {
        const index = buffer.indexOf('\n');
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        let parsed;
        try { parsed = JSON.parse(line); } catch { continue; }
        if (parsed?.type === 'ready') {
          clearTimeout(timer);
          resolve(parsed);
          return;
        }
      }
    });
  });

  return { child, ready, stderr: () => stderr };
}

async function stopFixtureCleanly(fixture, child, stderr) {
  assert.equal(child.exitCode, null, `${fixture.label} fixture must still be running before shutdown`);
  assert.equal(child.signalCode, null, `${fixture.label} fixture must not already be signaled before shutdown`);
  child.kill('SIGTERM');
  const exit = await Promise.race([
    once(child, 'exit').then(([code, signal]) => ({ exited: true, code, signal })),
    delay(2_500).then(() => ({ exited: false, code: null, signal: null }))
  ]);
  if (!exit.exited) {
    child.kill('SIGKILL');
    await once(child, 'exit');
    assert.fail(`${fixture.label} fixture did not shut down cleanly after SIGTERM: ${stderr()}`);
  }
  assert.equal(exit.code, 0, `${fixture.label} fixture shutdown must exit with code 0: ${stderr()}`);
  assert.equal(exit.signal, null, `${fixture.label} fixture shutdown must not terminate by signal: ${stderr()}`);
}

for (const fixture of FIXTURES) {
  test(`Sprint E ${fixture.label} fixture is exact-pinned and closes cleanly`, async () => {
    const packageJson = JSON.parse(await readFile(PACKAGE_URL, 'utf8'));
    assert.equal(
      packageJson.devDependencies?.[fixture.packageName],
      fixture.expectedVersion,
      `${fixture.label} official SDK dependency must remain exact-pinned`
    );

    const { child, ready, stderr } = await startFixture(fixture);
    try {
      assert.equal(ready.sdkPackage, fixture.packageName);
      assert.equal(ready.sdkVersion, fixture.expectedVersion);
      await stopFixtureCleanly(fixture, child, stderr);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await once(child, 'exit');
      }
    }
  });
}
