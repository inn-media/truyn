import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

function launchNumbers() {
  return fs.readdirSync('.github/d500')
    .map((name) => /^launch-(\d{2})\.txt$/.exec(name))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
}

test('D-500 generational preflight accepts only steady history or its immediate successor', () => {
  const numbers = launchNumbers();
  for (let i = 0; i < numbers.length; i += 1) assert.equal(numbers[i], i + 1, 'launch history must be contiguous');

  const latest = numbers.at(-1) || 0;
  const workflow = fs.readFileSync('.github/workflows/d500-acceptance.yml', 'utf8');
  const latestToken = latest > 0 ? `launch-${String(latest).padStart(2, '0')}.txt` : null;
  const nextToken = `launch-${String(latest + 1).padStart(2, '0')}.txt`;
  const phase = latestToken && workflow.includes(`.github/d500/${latestToken}`) ? 'prepare' : 'launch';

  if (phase === 'launch') assert.match(workflow, new RegExp(`\\.github/d500/${nextToken.replace('.', '\\.')}`));

  const run = spawnSync('bash', ['scripts/class-d-500-preflight-qualification.sh'], {
    encoding: 'utf8',
    env: { ...process.env, D500_PREFLIGHT_PHASE: phase },
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /TRUYN_D500_PREFLIGHT_QUALIFICATION=PASS/);
  assert.match(run.stdout, new RegExp(`phase=${phase}`));
  assert.match(run.stdout, new RegExp(`history_count=${latest}`));
  if (phase === 'prepare') assert.match(run.stdout, /launchable=false/);
  else assert.match(run.stdout, new RegExp(`launchable=reviewed-attempt${latest + 1}-workflow-only`));
});
