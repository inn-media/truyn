import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=readFileSync(new URL('../sdk/java/src/main/java/org/truyn/sdk/TruynClient.java',import.meta.url),'utf8');
test('native Java compact CHAIN is nonblocking while provider handles signed stages',()=>{
 assert.match(file,/public CompletableFuture<Map<String,Object>> compactChain\(/);
 assert.match(file,/CompletableFuture\.supplyAsync\(\(\)->compactLifecycle\(\)\.chain\(stages\)\)/);
 assert.doesNotMatch(file,/compactChain\(List<Map<String,Object>> stages\)\{return future\(/);
});
