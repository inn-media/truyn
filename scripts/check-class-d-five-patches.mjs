#!/usr/bin/env node
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const requireAll = (label, text, tokens) => {
  const missing = tokens.filter((token) => !text.includes(token));
  if (missing.length) throw new Error(`${label} missing canonical invariants: ${missing.join(' | ')}`);
};
const requirePatterns = (label, text, patterns) => {
  const missing = patterns.filter(({ re }) => !re.test(text)).map(({ name }) => name);
  if (missing.length) throw new Error(`${label} missing canonical invariants: ${missing.join(' | ')}`);
};

const manifest = JSON.parse(read('config/class-d-five-patches.json'));
if (manifest.schema !== 'truyn.class-d.five-patches.v1') throw new Error('invalid class-d five-patch manifest schema');
if (manifest.status !== 'CANONICAL_REQUIRED' || manifest.policy?.failClosed !== true || manifest.policy?.silentRemovalForbidden !== true || manifest.policy?.acceptanceWeakeningForbidden !== true) {
  throw new Error('class-d five-patch policy must remain canonical and fail-closed');
}
for (const required of ['D-200', 'D-500', 'D-1000']) if (!manifest.requiredFor?.includes(required)) throw new Error(`missing required class ${required}`);
const patchIds = new Set((manifest.patches || []).map((patch) => patch.id));
for (const id of ['P1_DURABLE_WRITE_DIAGNOSTICS','P2_PARALLEL_DHT_REPLICATION','P3_PEER_RECORD_RENEWAL_JITTER','P4_RESUMABLE_FAIL_COLLECT_STAGE_DAG','P5_REAL_LOCAL_MULTIPROCESS_REPRO']) {
  if (!patchIds.has(id)) throw new Error(`missing canonical patch ${id}`);
}

const campaign = read('benchmarks/scale/class-d-azure-1000-campaign.sh');
requirePatterns('P1 durable-write diagnostics', campaign, [
  { name: 'per-write evidence marker', re: /TRUYN_D200_WRITE\s+host=/ },
  { name: 'curl failure return-code capture', re: /curl_rc_\\?\$\?/ },
  { name: 'remote failure aggregation', re: /d200_write_remote_failed=1/ },
  { name: 'acknowledgement evidence', re: /acks=\\?\$a\b/ },
  { name: 'bounded response body evidence', re: /body=\\?\$\(head\s+-c\s+300\b/ },
  { name: 'HTTP 200 plus minAcks=2 success condition', re: /\[\[\s+"?\\?\$code"?\s+==\s+200\s+&&\s+"?\\?\$a"?\s+-ge\s+2\s+\]\]/ },
  { name: 'five writes per host gate', re: /\[\[\s+"\$w"\s+!=\s+5\s+\]\]/ },
  { name: 'aggregate remote-write gate', re: /\[\[\s+"\$d200_write_remote_failed"\s+==\s+0\s+\]\]/ }
]);

const replication = read('network/replication/dht-replication.js');
requireAll('P2 parallel DHT replication', replication, [
  'Promise.allSettled(batch.map((peer) => this.rpc.store(peer, record)))',
  'while (storedAt.length < replicationFactor && cursor < candidates.length)',
  'if (acknowledgements < minAcks)',
  'TRUYN_DHT_WRITE_QUORUM'
]);

const runtime = read('network/runtime.js');
requireAll('P3 peer-record renewal jitter', runtime, [
  'const jitterMs = Math.floor(Math.random()',
  'Math.floor(this.peerRecordTtlMs / 4)',
  '300_000',
  '- this.peerRecordRenewBeforeMs - jitterMs'
]);

const runner = read('scripts/class-d-stage-runner.mjs');
requirePatterns('P4 resumable fail-collect DAG', runner, [
  { name: 'BLOCKED state', re: /status\s*:\s*['"]BLOCKED['"]/ },
  { name: 'INFRA state', re: /['"]INFRA['"]/ },
  { name: 'PASS reuse', re: /status\s*===?\s*['"]PASS['"]/ },
  { name: '--resume flag', re: /['"]--resume['"]/ },
  { name: '--resume-across-sha flag', re: /['"]--resume-across-sha['"]/ },
  { name: '--from flag', re: /['"]--from['"]/ },
  { name: 'atomic checkpoint write', re: /atomicWriteJson\s*\(/ },
  { name: 'fail-closed clean summary', re: /clean\s*:\s*counts\.FAIL\s*===\s*0\s*&&\s*counts\.BLOCKED\s*===\s*0\s*&&\s*counts\.INFRA\s*===\s*0/ }
]);

const wrapper = read('scripts/class-d-local-multiprocess-repro.mjs');
const local = read('scripts/d200-local-multiprocess-repro.mjs');
requireAll('P5 class-d multiprocess wrapper', wrapper, ['--class', 'd200-local-multiprocess-repro.mjs', 'TRUYN_CLASS_D_LOCAL_MULTIPROCESS']);
requireAll('P5 real multiprocess implementation', local, [
  "spawn(process.execPath, ['network/testnet/node-service.js']",
  "'/replicate'",
  "'/dht/readiness'",
  "'/faults/partition'",
  "'/faults/heal'",
  "'quic-direct'",
  'acquirePortBlock',
  'externalWriteConcurrency'
]);

const d1000 = read('scripts/class-d-1000-final-acceptance.sh');
requireAll('D-1000 inheritance', d1000, [
  'cp benchmarks/scale/class-d-azure-1000-campaign.sh',
  'cp benchmarks/scale/class-d-azure-1000-provision.sh'
]);

const workflow = read('.github/workflows/class-d-five-patch-preflight.yml');
requireAll('D-200/D-500/D-1000 preflight workflow', workflow, [
  'matrix:',
  'class_size: [200, 500, 1000]',
  'scripts/class-d-stage-runner.mjs',
  'fail-fast: false',
  'stage-checkpoint'
]);

const d200Workflow = read('.github/workflows/d200-bug-hunt.yml');
requireAll('D-200 canonical runner wiring', d200Workflow, [
  'scripts/class-d-stage-runner.mjs',
  '--class 200'
]);
const d200Lanes = read('config/d200-bug-hunt-lanes.json');
requireAll('D-200 lane-level shared repro wiring', d200Lanes, [
  'scripts/class-d-local-multiprocess-repro.mjs',
  '"--class","200"',
  'scripts/check-class-d-five-patches.mjs'
]);

const ci = read('.github/workflows/ci.yml');
requireAll('mandatory CI canonical enforcement', ci, ['node scripts/check-class-d-five-patches.mjs']);

console.log('TRUYN_CLASS_D_FIVE_PATCHES=PASS classes=D-200,D-500,D-1000 patches=5 fail_closed=true');
