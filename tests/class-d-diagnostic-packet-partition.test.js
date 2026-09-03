import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('D-200 packet-partition diagnostics preserve strict heal semantics and only inspect terminal failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'truyn-d200-packet-partition-'));
  const target = join(dir, 'campaign.sh');
  await copyFile('benchmarks/scale/class-d-azure-1000-campaign.sh', target);
  const before = await readFile(target, 'utf8');
  const beforePacket = before.indexOf('STAGE=packet-partition');
  const beforeHealed = before.indexOf('STAGE=healed-routing');
  assert.ok(beforePacket >= 0 && beforeHealed > beforePacket, 'expected bounded packet-partition block');
  const prefixBefore = before.slice(0, beforePacket);
  const suffixBefore = before.slice(beforeHealed);

  const run = spawnSync('python3', ['scripts/patch-class-d-diagnostic-packet-partition.py', target], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);

  const after = await readFile(target, 'utf8');
  const packetStart = after.indexOf('STAGE=packet-partition');
  const healedStart = after.indexOf('STAGE=healed-routing');
  assert.equal(after.slice(0, packetStart), prefixBefore, 'stages before packet partition must remain byte-identical');
  assert.equal(after.slice(healedStart), suffixBefore, 'stages after packet partition must remain byte-identical');
  const block = after.slice(packetStart, healedStart);

  assert.ok(block.includes("iptables -I OUTPUT 1 -p udp -d '${block_ip}'"), 'real UDP DROP must remain');
  assert.ok(block.includes("iptables -D OUTPUT -p udp -d '${block_ip}'"), 'real UDP heal must remain');
  assert.ok(block.includes('[[ "$partition_successes" == 0 ]]'), 'partition must still block every positive probe');
  assert.ok(block.includes('for n in $(seq 1 90); do'), 'heal retry count must remain unchanged');
  assert.ok(block.includes("curl -sS --max-time 6 -o /tmp/d1000-heal -w '%{http_code}'"), 'same heal /need probe must remain');
  assert.ok(block.includes('[[ "$heal_code" == 200 ]]'), 'heal must still require HTTP 200');
  assert.ok(block.includes('[[ "$partition_recovery_ms" -le 120000 ]]'), 'packet recovery limit must remain 120 seconds');

  const loop = block.indexOf('for n in $(seq 1 90); do');
  const diagnostic = block.indexOf('PACKET_DIAG_PHASE=heal-timeout');
  const successGate = block.indexOf('[[ "$heal_code" == 200 ]]');
  assert.ok(loop >= 0 && diagnostic > loop && successGate > diagnostic, 'diagnostics must run only after heal retries are exhausted and before the unchanged fail-closed gate');

  for (const field of ['ActiveState', 'SubState', 'Result', 'MainPID', 'NRestarts', 'ExecMainCode', 'ExecMainStatus', 'StateChangeTimestamp']) {
    assert.ok(block.includes(`-p ${field}`), `expected systemd diagnostic ${field}`);
  }
  assert.ok(block.includes('journalctl -u ') && block.includes('-n 40 --no-pager -o short-iso'), 'terminal failure must capture bounded journal tail');
  assert.ok(block.includes('systemctl show ') && block.includes('--no-pager -p ActiveState'), 'terminal failure must capture bounded systemd unit state');
  assert.ok(block.includes('PACKET_DIAG_PROCESS_COUNT='), 'terminal failure must capture node-service process count');
  assert.ok(block.includes('PACKET_DIAG_CONTROL_LISTENERS_BEGIN'), 'terminal failure must capture control listeners');
  assert.ok(block.includes('PACKET_DIAG_QUIC_LISTENERS_BEGIN'), 'terminal failure must capture QUIC listeners');
  assert.ok(block.includes('PACKET_DIAG_PARTITION_RULES_BEGIN'), 'terminal failure must prove whether a DROP rule remains');

  assert.equal(block.includes('systemctl restart'), false, 'diagnostic patch must never restart a service');
  assert.equal(block.includes('systemctl start'), false, 'diagnostic patch must never start a service');
  assert.equal(block.includes('systemctl stop'), false, 'diagnostic patch must never stop a service');
  assert.equal(block.includes('TimeoutStopSec'), false, 'diagnostic patch must not alter service timing');
  assert.equal(block.includes('maxIdleTimeout'), false, 'diagnostic patch must not alter QUIC timing');

  const shell = spawnSync('bash', ['-n', target], { encoding: 'utf8' });
  assert.equal(shell.status, 0, shell.stderr || shell.stdout);

  const second = spawnSync('python3', ['scripts/patch-class-d-diagnostic-packet-partition.py', target], { encoding: 'utf8' });
  assert.notEqual(second.status, 0, 'patch must fail closed when applied twice');
});
