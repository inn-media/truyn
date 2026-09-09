'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTestedSourceCommit } = require('../scripts/validate-d200-tested-source-dco.js');
const signed = 'fix: source\n\nSigned-off-by: Dev Example <dev@example.com>';
function commit(overrides = {}) { return { sha:'merge', commit:{message:'Merge pull request #559 from inn-media/repair', verification:{verified:true}}, committer:{login:'web-flow'}, parents:[{sha:'base'},{sha:'head'}], ...overrides }; }
test('direct signed-off source',()=>assert.equal(validateTestedSourceCommit(commit({commit:{message:signed,verification:{verified:false}},committer:{login:'developer'},parents:[{sha:'base'}]})).mode,'direct-signed-off'));
test('verified GitHub merge with signed exact head',()=>assert.equal(validateTestedSourceCommit(commit(),{sha:'head',commit:{message:signed}}).mode,'verified-github-merge-with-signed-head'));
test('rejects unsigned non-merge',()=>assert.throws(()=>validateTestedSourceCommit(commit({commit:{message:'fix: unsigned',verification:{verified:true}},parents:[{sha:'base'}]})),/two-parent GitHub merge/));
test('rejects unverified merge',()=>assert.throws(()=>validateTestedSourceCommit(commit({commit:{message:'Merge pull request #559 from inn-media/repair',verification:{verified:false}}}),{sha:'head',commit:{message:signed}}),/cryptographically verified/));
test('rejects mismatched or unsigned head',()=>{ assert.throws(()=>validateTestedSourceCommit(commit(),{sha:'other',commit:{message:signed}}),/second parent/); assert.throws(()=>validateTestedSourceCommit(commit(),{sha:'head',commit:{message:'fix: unsigned'}}),/Signed-off-by/); });
