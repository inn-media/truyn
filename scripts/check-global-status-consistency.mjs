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
assert.match(central, /S-200 six-provider composite/);
for(const key of ['README.md','ROADMAP.md','docs/README.md','docs/architecture/IMPLEMENTATION_STATUS.md']){
  assert.match(bodies[key],/S_SERIES_S200_DOUBLE_CHECK_2026-10-13\.md/,key);
  assert.match(bodies[key],/S-200/,key);
}
const s200=JSON.parse(readFileSync('docs/benchmarks/evidence/S_SERIES_S200_2026-10-12.json','utf8'));
const s200dc=JSON.parse(readFileSync('docs/benchmarks/evidence/S_SERIES_S200_DOUBLE_CHECK_2026-10-13.json','utf8'));
assert.equal(s200.status,'PASS_CLOSED_SIX_PROVIDER_COMPOSITE');
assert.equal(s200.contractSevenProviderStatus,'OPEN_DEEPSEEK_NOT_MEASURED');
assert.equal(s200.evidence.attempt15.composite,true);
assert.equal(s200.evidence.attempt15.oneRunProof,false);
assert.equal(s200dc.status,'PASS_CLOSED_SIX_PROVIDER_DOUBLE_CHECK_VERIFIED');
assert.equal(s200dc.doubleCheck.attempt,17);
assert.equal(s200dc.doubleCheck.allScenariosFresh,true);
assert.equal(s200dc.doubleCheck.historicalEvidenceAdopted,false);
assert.equal(s200dc.doubleCheck.suite,'PASS');
assert.equal(s200dc.metrics.contentionNonProviderP95Ms,2412);
assert.ok(s200dc.metrics.costRoutingSavingsPct>0);

for (const [path, body] of Object.entries(bodies)) {
  assert.doesNotMatch(body, /D-5000 \| \*\*NOT ACCEPTED\*\*; live Attempt 3/, path);
  assert.doesNotMatch(body, /N-Series emergent network behavior — \*\*FOUNDATION DEFINED \/ NOT YET EXECUTED\*\*/, path);
  assert.doesNotMatch(body, /Commercial proof \/ T-series \| \*\*FOUNDATION ACTIVE \/ no result claim\*\*/, path);
}
assert.match(bodies['ROADMAP.md'], /N\/SOVEREIGNTY-10 qualification GREEN/);
assert.match(bodies['ROADMAP.md'], /T\/BREAK-EVEN-REAL Attempt 6 audited PASS/);
console.log('GLOBAL_STATUS_CONSISTENCY=PASS');
