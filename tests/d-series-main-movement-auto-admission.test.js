import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(p, 'utf8');
const closure = JSON.parse(read('config/d-series-legacy-automation-retirement.json'));
const onBlock = name => {
  const source = read(name);
  const at = source.indexOf('\non:\n');
  assert.ok(at >= 0, 'missing workflow trigger: ' + name);
  return source.slice(at + 5).split('\npermissions:')[0];
};
test('legacy automatic Class-D cascade is closed permanently', () => {
  assert.equal(closure.state, 'CLOSED_MANUAL_ONLY');
  assert.equal(closure.automaticTriggersDisabled.length, 5);
  for (const filename of closure.automaticTriggersDisabled) {
    assert.match(onBlock(filename), /^  workflow_dispatch:/m);
    assert.doesNotMatch(onBlock(filename), /^  (?:push|pull_request|workflow_run|schedule|repository_dispatch):/m);
  }
  for (const filename of closure.automaticTriggersDisabled.slice(3))
    assert.match(onBlock(filename), /^  workflow_call:/m);
});
test('manual D candidate admission continues to fail closed', () => {
  const gate = read('.github/workflows/d-series-admission-gate.yml');
  const qualifier = read('.github/workflows/d-series-frozen-candidate-qualification.yml');
  const self = read('.github/workflows/d-series-candidate-self-admission.yml');
  for (const marker of ['qualification_run_id:', 'qualification_manifest_missing_after_attempt', 'exit 25', 'd-series-qualification-manifest.mjs admission', 'finalize-d-series-admission.mjs'])
    assert.ok(gate.includes(marker), marker);
  for (const marker of ['candidate_sha:', 'swarm_run_id:', 'blockwise_run_id:', 'Build automatic D qualification manifest', 'Upload immutable candidate qualification manifest'])
    assert.ok(qualifier.includes(marker), marker);
  assert.ok(self.includes('CANDIDATE_SHA: $' + '{{ inputs.candidate_sha }}'));
  assert.ok(self.includes('event=workflow_dispatch'));
  assert.ok(!self.includes('github.event.pull_request.head.sha'));
});
test('accepted D-Series identities are preserved; new campaigns require separate admission', () => {
  assert.deepEqual(closure.accepted.map(x => x.scale), ['D-200', 'D-500', 'D-1000', 'D-5000']);
  for (const item of closure.accepted) {
    assert.equal(item.status, 'ACCEPTED_CLOSED');
    assert.match(item.primaryRun, /^[0-9]+$/);
    assert.ok(fs.existsSync(item.authoritativeDocumentation));
  }
  assert.equal(closure.futureCandidateRequiresNewExplicitQualification,true);
  assert.equal(closure.immutableEvidenceUnchanged,true);
  assert.equal(closure.acceptanceThresholdsUnchanged,true);
  assert.equal(closure.manualPaidBenchmarkLaunchAuthorized,false);
  assert.equal(JSON.parse(read('config/d-series-frozen-candidate-policy.json')).state,'LOCKED');
});
