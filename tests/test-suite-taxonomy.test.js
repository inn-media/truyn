import assert from 'node:assert/strict'; import test from 'node:test'; import {allTests,classify} from '../scripts/test-suite-map.mjs';
test('every repository test is assigned to a bounded non-full suite',()=>{const orphans=allTests().filter(p=>![...classify(p)].some(x=>!['full','fast'].includes(x)));assert.deepEqual(orphans,[]);});
