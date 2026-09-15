#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const clip = (value, max = 12000) => {
  const text = String(value ?? '');
  return text.length <= max ? text : `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;
};
const normalize = (value) => String(value ?? '')
  .replace(/[0-9a-f]{40,64}/gi, '<hex>')
  .replace(/\b\d{4,}\b/g, '<n>')
  .replace(/\/tmp\/[^\s]+/g, '<tmp>')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 600);

export function loadLane(configPath, laneId) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config.schema !== 'truyn.d200.bug-hunt.v1' || !Array.isArray(config.lanes)) throw new Error('invalid D-200 bug-hunt config');
  const lane = config.lanes.find((candidate) => candidate.id === laneId);
  if (!lane) throw new Error(`unknown D-200 bug-hunt lane: ${laneId}`);
  if (!lane.domain || !Array.isArray(lane.commands) || lane.commands.length === 0) throw new Error(`invalid lane definition: ${laneId}`);
  return lane;
}

export function runLane({ lane, sourceSha = process.env.GITHUB_SHA || null, cwd = process.cwd() }) {
  const startedAt = new Date().toISOString();
  const commands = [];
  let status = 'PASS';
  let firstFailure = null;
  for (const command of lane.commands) {
    const argv = Array.isArray(command.argv) ? command.argv : [];
    if (argv.length === 0) {
      status = 'INFRA';
      firstFailure ??= { label: command.label || 'invalid-command', exitCode: null, signature: 'empty argv' };
      commands.push({ label: command.label || 'invalid-command', argv: [], exitCode: null, error: 'empty argv' });
      continue;
    }
    const [bin, ...args] = argv;
    const result = spawnSync(bin, args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, TRUYN_LOCAL_DEVELOPMENT: process.env.TRUYN_LOCAL_DEVELOPMENT || '1' },
      timeout: Number(command.timeoutMs || 180000)
    });
    const exitCode = typeof result.status === 'number' ? result.status : null;
    const spawnError = result.error ? `${result.error.name}: ${result.error.message}` : null;
    const combined = `${result.stderr || ''}\n${result.stdout || ''}\n${spawnError || ''}`.trim();
    const record = {
      label: command.label || argv.join(' '),
      argv,
      exitCode,
      signal: result.signal || null,
      stdout: clip(result.stdout),
      stderr: clip(result.stderr),
      error: spawnError
    };
    commands.push(record);
    if (spawnError || exitCode === null) {
      status = 'INFRA';
      firstFailure ??= { label: record.label, exitCode, signature: normalize(combined || spawnError || 'spawn failure') };
    } else if (exitCode !== 0 && status !== 'INFRA') {
      status = 'FAIL';
      firstFailure ??= { label: record.label, exitCode, signature: normalize(combined || `exit ${exitCode}`) };
    }
  }
  const fingerprintMaterial = firstFailure
    ? `${lane.domain}|${firstFailure.label}|${firstFailure.exitCode ?? 'null'}|${firstFailure.signature}`
    : `${lane.domain}|PASS`;
  const fingerprint = crypto.createHash('sha256').update(fingerprintMaterial).digest('hex');
  return {
    schema: 'truyn.d200.bug-hunt.result.v1',
    laneId: lane.id,
    domain: lane.domain,
    status,
    sourceSha,
    startedAt,
    finishedAt: new Date().toISOString(),
    fingerprint,
    firstFailure,
    commands
  };
}

function main(argv = process.argv.slice(2)) {
  const laneId = argv[0];
  if (!laneId) throw new Error('usage: d200-bug-hunt-lane.mjs <lane-id> [--config path] [--result path]');
  const configIndex = argv.indexOf('--config');
  const resultIndex = argv.indexOf('--result');
  const configPath = configIndex >= 0 ? argv[configIndex + 1] : 'config/d200-bug-hunt-lanes.json';
  const resultPath = resultIndex >= 0 ? argv[resultIndex + 1] : (process.env.D200_LANE_RESULT || `d200-lane-${laneId}.json`);
  let result;
  try {
    const lane = loadLane(configPath, laneId);
    result = runLane({ lane });
  } catch (error) {
    const signature = normalize(error?.stack || error?.message || error);
    result = {
      schema: 'truyn.d200.bug-hunt.result.v1', laneId, domain: 'orchestration', status: 'INFRA', sourceSha: process.env.GITHUB_SHA || null,
      startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      fingerprint: crypto.createHash('sha256').update(`orchestration|${signature}`).digest('hex'),
      firstFailure: { label: 'orchestration', exitCode: null, signature }, commands: []
    };
  }
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`TRUYN_D200_BUG_HUNT_LANE lane=${result.laneId} status=${result.status} fingerprint=${result.fingerprint}`);
  process.exitCode = 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
