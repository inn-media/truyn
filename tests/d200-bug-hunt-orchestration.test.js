import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runLane } from '../scripts/d200-bug-hunt-lane.mjs';
import { aggregate } from '../scripts/d200-bug-hunt-aggregate.mjs';

test('bug-hunt lane records FAIL without throwing or cancelling peer lanes', () => {
  const lane = { id: 'x', domain: 'demo', commands: [{ label: 'fail', argv: [process.execPath, '-e', 'process.exit(7)'] }] };
  const result = runLane({ lane, cwd: process.cwd(), sourceSha: 'abc' });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.commands[0].exitCode, 7);
  assert.equal(result.sourceSha, 'abc');
  assert.match(result.fingerprint, /^[0-9a-f]{64}$/);
});

test('aggregate preserves every expected lane and groups identical fingerprints', () => {
  const config = { lanes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  const results = [
    { laneId: 'a', domain: 'd1', status: 'PASS', fingerprint: 'p' },
    { laneId: 'b', domain: 'd2', status: 'FAIL', fingerprint: 'same', firstFailure: { label: 'x' } },
    { laneId: 'c', domain: 'd2', status: 'FAIL', fingerprint: 'same', firstFailure: { label: 'x' } }
  ];
  const summary = aggregate({ config, results });
  assert.deepEqual(summary.counts, { PASS: 1, FAIL: 2, BLOCKED: 0, INFRA: 0, SKIP: 0 });
  assert.equal(summary.clean, false);
  assert.equal(summary.rootCauseGroups.length, 1);
  assert.deepEqual(summary.rootCauseGroups[0].lanes.sort(), ['b', 'c']);
});

test('aggregate fails closed when a lane result is missing', () => {
  const config = { lanes: [{ id: 'a' }, { id: 'b' }] };
  const summary = aggregate({ config, results: [{ laneId: 'a', domain: 'd', status: 'PASS', fingerprint: 'p' }] });
  assert.equal(summary.counts.INFRA, 1);
  assert.equal(summary.clean, false);
  assert.equal(summary.lanes.find((lane) => lane.laneId === 'b').status, 'INFRA');
});

test('workflow is non-fail-fast and aggregate enforcement runs after all lanes', () => {
  const workflow = fs.readFileSync('.github/workflows/d200-bug-hunt.yml', 'utf8');
  assert.match(workflow, /fail-fast:\s*false/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /d200-bug-hunt-aggregate\.mjs[^\n]*--enforce/);
});

test('ordinary CI mandatory security/safety lane remains unconditional', () => {
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  const mandatoryStart = ci.indexOf('\n  mandatory:');
  const mandatoryEnd = ci.indexOf('\n  regression:', mandatoryStart);
  assert.ok(mandatoryStart >= 0 && mandatoryEnd > mandatoryStart, 'mandatory CI job boundaries must be present');
  const mandatory = ci.slice(mandatoryStart, mandatoryEnd);
  assert.ok(mandatory.includes('npm run test:fast'));
  assert.ok(mandatory.includes('npm run test:security'));
  assert.ok(mandatory.includes('node scripts/check-d200-contract.mjs'));
  assert.ok(!/^\s+if:/m.test(mandatory), 'mandatory lane must not be path-filtered');
});
