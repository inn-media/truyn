import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Execute the exact fixture childWork body with local ledger stubs. This
// proves process/IPC liveness, NOT Cosmos durability, cloud identity or G5 PASS.
test('G5 crash witness: persisted child remains alive until supervisor SIGKILL', { timeout: 10000 }, async t => {
  const source = readFileSync(new URL('./fixtures/g5-azure-isolated-twohost-worker.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function childWork()');
  const end = source.indexOf('async function hostA()', start);
  assert.ok(start >= 0 && end > start, 'cannot isolate the actual worker child function');
  const dir = mkdtempSync(join(tmpdir(), 'g5-child-liveness-'));
  const path = join(dir, 'child.mjs');
  writeFileSync(path, `import assert from 'node:assert/strict';
const reservation = {id:'fixture'}, effect = {id:'fixture'};
const runId='123456789', sourceSha='a'.repeat(40);
let reserved = false;
const ledger = {
  async reserveNeed(value) { assert.equal(value,reservation); reserved=true; },
  async beginEffect(value) { assert.equal(value,effect); assert.equal(reserved,true); return {acquired:true}; }
};
${source.slice(start,end)}
await childWork();
`);
  const child = fork(path, [], {execArgv:[], stdio:['ignore','ignore','pipe','ipc']});
  let stderr = '';
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4096); });
  const exited = new Promise((resolve, reject) => {
    child.once('exit', (code, signal) => resolve({code, signal}));
    child.once('error', reject);
  });
  // Attach a rejection handler immediately to keep early spawn failure bounded.
  exited.catch(() => {});
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited.catch(() => {});
    rmSync(dir, {recursive:true, force:true});
  });
  let watchdog;
  try {
    const message = await Promise.race([
      new Promise(resolve => child.once('message', resolve)),
      exited.then(result => { throw new Error('child exited before checkpoint: '+JSON.stringify(result)+' '+stderr); }),
      new Promise((_, reject) => { watchdog=setTimeout(() => reject(new Error('child checkpoint timeout')), 5000); })
    ]);
    assert.equal(message.checkpoint, 'durable-reservation-and-effect');
    assert.equal(message.runId, '123456789');
    assert.equal(message.sourceSha, 'a'.repeat(40));
    // Allow event-loop/TLA exit to occur: a checkpoint message alone is not a kill witness.
    await delay(150);
    assert.equal(child.exitCode, null, 'child self-exited rather than waiting for SIGKILL: '+stderr);
    assert.equal(child.signalCode, null);
    assert.equal(child.kill('SIGKILL'), true);
    assert.deepEqual(await exited, {code:null, signal:'SIGKILL'});
  } finally { clearTimeout(watchdog); }
});
