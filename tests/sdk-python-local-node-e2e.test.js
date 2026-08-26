import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createRelay } from '../network/relay/server.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

function runPythonE2E(relayUrl) {
  const python = process.platform === 'win32' ? 'python' : 'python3';
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['sdk/python/tests/local_node_e2e.py'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        TRUYN_E2E_RELAY_URL: relayUrl,
        PYTHONPATH: ['sdk/python/src', process.env.PYTHONPATH]
          .filter(Boolean)
          .join(process.platform === 'win32' ? ';' : ':')
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('Python SDK local-node E2E completes verified NEED -> RESULT through the real relay runtime', async () => {
  const relay = createRelay({ localDevelopmentMode: true });
  const relayUrl = await relay.listen({ port: 0 });
  try {
    const run = await runPythonE2E(relayUrl);
    assert.equal(run.code, 0, `Python local-node E2E failed\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`);
  } finally {
    await relay.close();
  }
});
