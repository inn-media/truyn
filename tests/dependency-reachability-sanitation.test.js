import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('dependency audit covers entire tracked public tree and refuses unsafe deletes',()=>{
 const out=execFileSync(process.execPath,['scripts/audit-dependency-reachability.mjs'],{encoding:'utf8',maxBuffer:20*1024*1024});
 const row=out.split('\n').find(x=>x.startsWith('DEPENDENCY_AUDIT='));
 assert.ok(row,'structured dependency report');
 const r=JSON.parse(row.slice('DEPENDENCY_AUDIT='.length));
 assert.equal(r.schema,'truyn.dependency-reachability/v1');
 assert.ok(r.files>1000&&r.scannedText>300);
 assert.ok(r.staticEdges>100);
 assert.ok(r.identicalContentGroups.some(g=>g.paths.includes('LICENSE')&&g.paths.includes('sdk/LICENSE')));
 assert.deepEqual(r.authorizedDeletions,[]);
 assert.ok(r.unreferencedCandidates.every(c=>c.deletionAuthorized===false));
});
