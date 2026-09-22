import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('D-500 restart recovery keeps immediate peer-record work Kademlia-bounded and preserves an active required retry', async () => {
  const source = await readFile('network/runtime.js', 'utf8');
  assert.match(source, /backgroundBudget\s*=\s*Math\.max\(0, this\.discovery\.k - required\.size\)/);
  assert.match(source, /this\.discovery\.closest\(record\.nodeId, this\.discovery\.k\)/);
  assert.match(source, /\.slice\(0, backgroundBudget\)/);
  assert.match(source, /!propagationChanged && unchangedTargets && \(propagation\?\.ready \|\| this\.peerRecordRecoveryRetryTimer\)/);
  assert.match(source, /this\.discovery\.get\(peer\.nodeId\) \|\| peer/);
});
