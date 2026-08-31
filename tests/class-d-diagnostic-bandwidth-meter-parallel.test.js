import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 diagnostic patch fans bandwidth meter setup across all hosts without changing rules', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-bandwidth-meter-parallel-'));
  const target = join(dir, 'provision.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-provision.sh', target);
  const before = await readFile(target, 'utf8');
  const stage = 'STAGE=bandwidth-meter';
  const beforeStart = before.indexOf(stage);
  assert.ok(beforeStart >= 0, 'expected canonical bandwidth-meter stage');
  const beforePrefix = before.slice(0, beforeStart);

  const run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-bandwidth-meter-parallel.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const after = await readFile(target, 'utf8');
  const afterStart = after.indexOf(stage);
  assert.ok(afterStart >= 0, 'expected patched bandwidth-meter stage');
  assert.equal(after.slice(0, afterStart), beforePrefix, 'everything before bandwidth-meter must remain byte-identical');
  const block = after.slice(afterStart);

  const command = 'remote "${VMS[$i]}" "iptables -I OUTPUT 1 -p udp --dport ${QUIC_BASE}:$((QUIC_BASE+NODES_PER_HOST-1)) -m comment --comment truyn-d1000-meter-out -j ACCEPT; iptables -I INPUT 1 -p udp --sport ${QUIC_BASE}:$((QUIC_BASE+NODES_PER_HOST-1)) -m comment --comment truyn-d1000-meter-in -j ACCEPT; echo METER=1"';
  const launchLine = `(${command} >"$meter_dir/$i") &`;

  assert.ok(block.includes('meter_dir=$(mktemp -d)'), 'expected temp directory for host outputs');
  assert.ok(block.includes('meter_pids=()'), 'expected PID collection');
  assert.ok(block.includes(launchLine), 'expected the exact canonical meter command to be launched in background');
  assert.ok(block.includes('meter_pids+=("$!")'), 'expected PID capture');
  assert.ok(block.includes('for pid in "${meter_pids[@]}"; do'), 'expected wait loop after fan-out');
  assert.ok(block.includes('if ! wait "$pid"; then meter_failed=1; fi'), 'expected fail-closed wait aggregation');
  assert.ok(block.includes('if [[ "$meter_failed" != 0 ]]; then'), 'expected aggregate failure gate');
  assert.ok(block.includes('[[ "$(marker "$out" METER)" == 1 ]]'), 'every host must retain the existing METER marker proof');
  assert.ok(block.includes('stage=bandwidth-meter host=$i mode=parallel-hosts status=PASS'), 'expected per-host telemetry after all waits');

  const launchIndex = block.indexOf(launchLine);
  const waitIndex = block.indexOf('for pid in "${meter_pids[@]}"; do');
  const aggregateIndex = block.indexOf('for i in $(seq 0 $((HOST_COUNT-1))); do', waitIndex);
  assert.ok(launchIndex >= 0 && waitIndex > launchIndex, 'all host launches must precede waiting');
  assert.ok(aggregateIndex > waitIndex, 'aggregation must happen after every PID is waited');
  assert.equal(block.slice(0, waitIndex).includes(`${command} >/dev/null`), false, 'sequential meter invocation must be removed');

  const originalCommand = '  remote "${VMS[$i]}" "iptables -I OUTPUT 1 -p udp --dport ${QUIC_BASE}:$((QUIC_BASE+NODES_PER_HOST-1)) -m comment --comment truyn-d1000-meter-out -j ACCEPT; iptables -I INPUT 1 -p udp --sport ${QUIC_BASE}:$((QUIC_BASE+NODES_PER_HOST-1)) -m comment --comment truyn-d1000-meter-in -j ACCEPT; echo METER=1" >/dev/null';
  assert.ok(before.slice(beforeStart).includes(originalCommand), 'expected exact canonical command in source fixture');
  assert.equal(block.includes('--comment truyn-d1000-meter-out -j ACCEPT'), true);
  assert.equal(block.includes('--comment truyn-d1000-meter-in -j ACCEPT'), true);
  assert.equal(block.includes('QUIC_BASE+NODES_PER_HOST-1'), true);

  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-bandwidth-meter-parallel.py', target], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'patch must fail closed when applied twice');
});
