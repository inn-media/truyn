import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const c=JSON.parse(fs.readFileSync('config/n-series-swarm-blockwise-architecture-lock.json','utf8'));
test('N-Series public architecture cannot regress from Swarm-Blockwise',()=>{
 assert.equal(c.executionEngine,'SWARM_BLOCKWISE');
 assert.deepEqual(c.blocks,['N1','N2','N3','N4','N5','N6','N7']);
 assert.equal(c.mainMovementPolicy,'ADMISSION_ANALYSIS_NOT_AUTOMATIC_FULL_RERUN');
 assert.equal(c.selectiveRerunRequired,true);
 assert.equal(c.integrationFingerprintRequired,true);
 assert.equal(c.combinedStateAdmissionRequired,true);
 assert.equal(c.historicalGreenAloneIsInsufficient,true);
 assert.deepEqual(c.sovereigntyCells,[10,50,100]);
 assert.equal(c.sovereigntyCellsIndependent,true);
 assert.equal(c.seriesWideSerializationForbidden,true);
 assert.equal(c.bypassForbidden,true);
});
