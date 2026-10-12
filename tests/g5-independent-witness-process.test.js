import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, openSync, writeFileSync, fsyncSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseEffect, keypair, witnessFor } from './fixtures/g5-witness-model.mjs';

const deadline = (promise, ms = 7000) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('process proof deadline')), ms); })])
    .finally(() => clearTimeout(timer));
};

test('real SIGKILL before worker receives response ID; fresh OS process recovers from independent signed witness without POST', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'g5-witness-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'mock-remote-state.json');
  const keys = keypair(); // Only the independent service owns the private key.
  let state = { row: baseEffect(), witnesses: [], response: null, posts: 0, gets: 0, puts: 0 };
  const persist = () => {
    const fd = openSync(file, 'w', 0o600);
    try { writeFileSync(fd, JSON.stringify(state)); fsyncSync(fd); } finally { closeSync(fd); }
  };
  persist();
  let witnessed;
  const effectObserved = new Promise(resolve => { witnessed = resolve; });
  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    try {
      if (req.url === '/effect') return reply(200, state.row);
      if (req.url === '/witnesses') return reply(200, state.witnesses);
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) throw Error('test body too large'); }
      if (req.url.startsWith('/cosmos/') && req.method === 'PUT') {
        if (req.headers['if-match'] !== state.row._etag) return reply(412, {});
        const row = JSON.parse(raw); state.row = { ...row, _etag: 'v' + row.version }; state.puts++; persist();
        return reply(200, state.row);
      }
      if (req.url === '/azure/openai/v1/responses' && req.method === 'POST') {
        assert.ok(state.row.receiptExecution?.correlationId, 'precommit exists before remote effect');
        state.posts++;
        const body = JSON.parse(raw);
        state.response = { id: 'resp_survived_worker', status: 'completed', model: 'fixture-version',
          output_text: 'private result', usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 }, metadata: body.metadata };
        state.witnesses = [witnessFor(state.response, keys)]; persist();
        witnessed();
        // The remote effect and witness exist, but the worker NEVER receives
        // headers or JSON containing response_id. Parent kills that OS process.
        return;
      }
      if (req.url === '/azure/openai/v1/responses/resp_survived_worker' && req.method === 'GET') {
        state.gets++; persist(); return reply(200, state.response);
      }
      reply(404, {});
    } catch (error) { reply(500, { error: error.message }); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const url = 'http://127.0.0.1:' + server.address().port;
  const spawn = role => {
    const child = fork(fileURLToPath(new URL('./fixtures/g5-independent-witness-process.mjs', import.meta.url)), [], {
      env: { G5_LOCAL_TEST_CONFIG: JSON.stringify({ role, url, publicKey: keys.publicKey }) },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    });
    child.stderr.resume();
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited;
      }
    });
    return child;
  };
  const first = spawn('execute');
  const firstExit = once(first, 'exit');
  await deadline(Promise.race([effectObserved, firstExit.then(() => { throw Error('worker exited before remote effect'); })]));
  assert.equal(state.row.effectReceipt, undefined);
  first.kill('SIGKILL');
  const [exitCode, signal] = await deadline(firstExit);
  assert.equal(exitCode, null); assert.equal(signal, 'SIGKILL');
  // Reload service state from disk to exclude worker memory from recovery.
  state = JSON.parse(readFileSync(file, 'utf8'));
  state.row.status = 'unknown'; state.row.version++; state.row._etag = 'unknown-' + state.row.version; persist();
  const recovered = spawn('recover');
  const recoveredExit = once(recovered, 'exit');
  const [message] = await deadline(once(recovered, 'message'));
  const [recoveryCode] = await deadline(recoveredExit);
  assert.equal(recoveryCode, 0); assert.equal(message.ok, true, message.code);
  assert.equal(state.posts, 1); assert.equal(state.gets, 1);
  assert.equal(state.row.effectReceipt.responseId, 'resp_survived_worker');
  assert.equal(state.row.status, 'unknown');
  assert.equal(message.result.accountingSettled, false);
  assert.equal(message.result.providerInvoiceVerified, false);
  assert.equal(message.result.terminalDelivered, false);
  assert.notEqual(first.pid, recovered.pid);
  const proof = { schema: 'truyn.g5.local-crash-proof/v1',
    scenario: 'remote-effect-before-worker-response-id', executionProcessKilled: true,
    newProcessRecovery: true, independentWitnessKeyExcludedFromWorker: true,
    testModelOnly: true, storageModel: 'local-file-plus-ETag-emulator', upstreamModel: 'loopback-Azure-response-emulator',
    realAzure: false, actualPaidCalls: 0, simulatedProviderPosts: state.posts,
    simulatedProviderGets: state.gets, effectStatus: state.row.status,
    responseIdRecovered: true, providerInvoiceVerified: false, accountingSettled: false,
    terminalDelivered: false, G5: 'OPEN' };
  if (process.env.G5_LOCAL_PROOF_PATH) writeFileSync(process.env.G5_LOCAL_PROOF_PATH, JSON.stringify(proof, null, 2) + '\n');
});
