import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ON_CALL_OWNERSHIP_DOMAINS,
  DEFAULT_ESCALATION_POLICY,
  ON_CALL_HANDOFF_ITEMS,
  validateOnCallRotation,
  recordOnCallHandoff,
} from '../operations/on-call.js';

const ownership = Object.fromEntries(ON_CALL_OWNERSHIP_DOMAINS.map((domain) => [domain, `team:${domain}`]));

test('on-call contract requires distinct primary/secondary and complete ownership', () => {
  assert.equal(validateOnCallRotation({
    windows: [
      { startsAt: '2026-09-07T00:00:00Z', endsAt: '2026-09-14T00:00:00Z', primary: 'operator-a', secondary: 'operator-b' },
      { startsAt: '2026-09-14T00:00:00Z', endsAt: '2026-09-21T00:00:00Z', primary: 'operator-b', secondary: 'operator-c' },
    ],
    ownership,
  }), true);
  assert.equal(DEFAULT_ESCALATION_POLICY.SEV1.acknowledgeMinutes, 5);
  assert.equal(DEFAULT_ESCALATION_POLICY.SEV1.secondaryMinutes, 5);
});

test('on-call contract rejects coverage gaps and self-backup', () => {
  assert.throws(() => validateOnCallRotation({
    windows: [{ startsAt: '2026-09-07T00:00:00Z', endsAt: '2026-09-14T00:00:00Z', primary: 'operator-a', secondary: 'operator-a' }],
    ownership,
  }), /different humans/);
  assert.throws(() => validateOnCallRotation({
    windows: [
      { startsAt: '2026-09-07T00:00:00Z', endsAt: '2026-09-14T00:00:00Z', primary: 'operator-a', secondary: 'operator-b' },
      { startsAt: '2026-09-14T01:00:00Z', endsAt: '2026-09-21T00:00:00Z', primary: 'operator-b', secondary: 'operator-c' },
    ],
    ownership,
  }), /continuous coverage/);
});

test('handoff requires both incoming responders and every operational checklist item', () => {
  const checklist = Object.fromEntries(ON_CALL_HANDOFF_ITEMS.map((item) => [item, true]));
  const record = recordOnCallHandoff({
    outgoingPrimary: 'operator-a',
    incomingPrimary: 'operator-b',
    incomingSecondary: 'operator-c',
    checklist,
    acknowledgedBy: ['operator-b', 'operator-c'],
    evidenceRef: 'ops://on-call/handoff/2026-w37',
  });
  assert.equal(record.type, 'on-call-handoff');
  assert.equal(record.incomingPrimary, 'operator-b');
});
