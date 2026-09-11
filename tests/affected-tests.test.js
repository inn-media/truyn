import assert from 'node:assert/strict'; import test from 'node:test'; import {select} from '../scripts/affected-tests.mjs';
test('D-200 changes select network/regression plus mandatory gates but not SDK',()=>{const s=select(['network/runtime.js']);for(const x of ['fast','security','network','regression'])assert.ok(s.has(x));assert.ok(!s.has('sdk'));});
test('SDK changes trigger SDK and mandatory gates',()=>{const s=select(['sdk/go/client.go']);for(const x of ['fast','security','sdk'])assert.ok(s.has(x));});
test('unknown critical changes fail closed to full',()=>assert.ok(select(['mystery/new-surface.xyz']).has('full')));
