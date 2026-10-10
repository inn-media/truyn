#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = [
  'README.md',
  'ROADMAP.md',
  'docs/README.md',
  'docs/architecture/IMPLEMENTATION_STATUS.md',
  'docs/operations/GLOBAL_STATUS_RECONCILIATION_2026-10-10.md'
];
const bodies = Object.fromEntries(files.map((p) => [p, readFileSync(p, 'utf8')]));
const central = bodies['docs/operations/GLOBAL_STATUS_RECONCILIATION_2026-10-10.md'];
assert.match(central, /N\/SOVEREIGNTY-10/);
assert.match(central, /T\/BREAK-EVEN-REAL/);
assert.match(central, /D-5000/);
assert.match(central, /F-Series/);

for (const [path, body] of Object.entries(bodies)) {
  assert.doesNotMatch(body, /D-5000 \| \*\*NOT ACCEPTED\*\*; live Attempt 3/, path);
  assert.doesNotMatch(body, /N-Series emergent network behavior — \*\*FOUNDATION DEFINED \/ NOT YET EXECUTED\*\*/, path);
  assert.doesNotMatch(body, /Commercial proof \/ T-series \| \*\*FOUNDATION ACTIVE \/ no result claim\*\*/, path);
}
assert.match(bodies['ROADMAP.md'], /N\/SOVEREIGNTY-10 qualification GREEN/);
assert.match(bodies['ROADMAP.md'], /T\/BREAK-EVEN-REAL Attempt 6 audited PASS/);
console.log('GLOBAL_STATUS_CONSISTENCY=PASS');
