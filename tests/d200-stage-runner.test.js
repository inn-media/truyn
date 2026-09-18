import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPlan } from '../scripts/d200-stage-runner.mjs';

function stage(id, code, dependsOn = []) {
  return { id, dependsOn, inputs: [`${id}.txt`], command: { argv: [process.execPath, '-e', code], timeoutMs: 5000 } };
}

test('collects a failed stage while independent stages continue and dependents block', async () => {
  const root = await mkdtemp(join(tmpdir(), 'd200-stage-runner-'));
  try {
    const plan = { schema: 'truyn.d200.stage-plan.v1', stages: [
      stage('root', "console.log('root')"),
      stage('broken', "console.error('boom');process.exit(7)", ['root']),
      stage('independent', "console.log('still-ran')", ['root']),
      stage('dependent', "console.log('must-not-run')", ['broken'])
    ] };
    const checkpoint = join(root, 'checkpoint.json');
    const first = await runPlan({ plan, checkpointPath: checkpoint, cwd: root, sourceSha: 'sha-a', concurrency: 2 });
    assert.equal(first.summary.clean, false);
    assert.equal(first.results.get('broken').status, 'FAIL');
    assert.equal(first.results.get('independent').status, 'PASS');
    assert.equal(first.results.get('dependent').status, 'BLOCKED');
    const saved = JSON.parse(await readFile(checkpoint, 'utf8'));
    assert.equal(saved.summary.counts.FAIL, 1);
    assert.equal(saved.summary.counts.BLOCKED, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('resume reuses exact-SHA PASS stages and reruns failed plus blocked descendants', async () => {
  const root = await mkdtemp(join(tmpdir(), 'd200-stage-resume-'));
  try {
    const marker = join(root, 'marker.txt');
    const switchFile = join(root, 'switch.txt');
    await writeFile(switchFile, 'fail');
    const write = (name) => `require('node:fs').appendFileSync(${JSON.stringify(marker)}, ${JSON.stringify(name + '\n')})`;
    const bCode = `${write('b')};if(require('node:fs').readFileSync(${JSON.stringify(switchFile)},'utf8').trim()!=='pass')process.exit(3)`;
    const plan = { schema: 'truyn.d200.stage-plan.v1', stages: [
      stage('a', write('a')),
      stage('b', bCode, ['a']),
      stage('c', write('c'), ['a']),
      stage('d', write('d'), ['b'])
    ] };
    const checkpoint = join(root, 'checkpoint.json');
    await runPlan({ plan, checkpointPath: checkpoint, cwd: root, sourceSha: 'same-sha', concurrency: 2 });
    await writeFile(switchFile, 'pass');
    const second = await runPlan({ plan, checkpointPath: checkpoint, cwd: root, sourceSha: 'same-sha', resume: true, from: 'b', concurrency: 2 });
    assert.equal(second.summary.clean, true);
    assert.equal(second.results.get('a').reused, true);
    assert.equal(second.results.get('c').reused, true);
    assert.equal(second.results.get('b').reused, false);
    assert.equal(second.results.get('d').reused, false);
    const lines = (await readFile(marker, 'utf8')).trim().split(/\n/);
    assert.deepEqual(lines, ['a', 'b', 'c', 'b', 'd']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
