#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const blockId = argv[0];
const scaleIndex = argv.indexOf('--scale');
const resultIndex = argv.indexOf('--result');
const configIndex = argv.indexOf('--config');
const scale = scaleIndex >= 0 ? argv[scaleIndex + 1] : 'all';
const resultPath = resultIndex >= 0 ? argv[resultIndex + 1] : `d-series-block-${blockId}.json`;
const configPath = configIndex >= 0 ? argv[configIndex + 1] : 'config/d-series-blockwise-preflight.json';
const sourceSha = process.env.TRUYN_CLASS_D_SOURCE_SHA || process.env.GITHUB_SHA || null;
const allowedScales = new Set(['all', '200', '500', '1000']);

if (!blockId) throw new Error('usage: d-series-block-runner.mjs B01 [--scale all|200|500|1000] [--result path]');
if (!allowedScales.has(String(scale))) throw new Error(`invalid scale: ${scale}`);

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (config.schema !== 'truyn.d-series.blockwise-preflight.v1' || !Array.isArray(config.blocks)) throw new Error('invalid D-Series blockwise config');
const block = config.blocks.find((item) => item.id === blockId);
if (!block) throw new Error(`unknown D-Series block: ${blockId}`);

const clip = (value, max = 16000) => {
  const text = String(value ?? '');
  return text.length <= max ? text : `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;
};
const normalize = (value) => String(value ?? '')
  .replace(/[0-9a-f]{40,64}/gi, '<hex>')
  .replace(/\b\d{4,}\b/g, '<n>')
  .replace(/\/tmp\/[^\s]+/g, '<tmp>')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 800);
const substitute = (value, klass) => String(value).replaceAll('{class}', String(klass ?? ''));

const commandResults = [];
let blockStatus = 'PASS';
let firstFailure = null;
const selectedClasses = scale === 'all' ? config.classes : [Number(scale)];
const startedAt = new Date().toISOString();

for (const command of block.commands || []) {
  const commandClasses = Array.isArray(command.classes)
    ? command.classes.filter((klass) => selectedClasses.includes(Number(klass)))
    : [null];
  for (const klass of commandClasses) {
    const commandArgv = (command.argv || []).map((value) => substitute(value, klass));
    if (commandArgv.length === 0) continue;
    const [bin, ...args] = commandArgv;
    const commandStarted = Date.now();
    const result = spawnSync(bin, args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: Number(command.timeoutMs || 180000),
      env: {
        ...process.env,
        TRUYN_LOCAL_DEVELOPMENT: process.env.TRUYN_LOCAL_DEVELOPMENT || '1',
        TRUYN_CLASS_D_SOURCE_SHA: sourceSha || '',
        ...(klass == null ? {} : { TRUYN_CLASS_D_SIZE: String(klass), TRUYN_CLASS_D_NAME: `D-${klass}` })
      }
    });
    const exitCode = typeof result.status === 'number' ? result.status : null;
    const spawnError = result.error ? `${result.error.name}: ${result.error.message}` : null;
    const combined = `${result.stderr || ''}\n${result.stdout || ''}\n${spawnError || ''}`.trim();
    const row = {
      label: command.label || commandArgv.join(' '),
      classSize: klass,
      argv: commandArgv,
      exitCode,
      signal: result.signal || null,
      durationMs: Date.now() - commandStarted,
      stdout: clip(result.stdout),
      stderr: clip(result.stderr),
      error: spawnError
    };
    commandResults.push(row);
    if (spawnError || exitCode === null) {
      blockStatus = 'INFRA';
      firstFailure ??= { label: row.label, classSize: klass, exitCode, signature: normalize(combined || spawnError || 'spawn failure') };
    } else if (exitCode !== 0 && blockStatus !== 'INFRA') {
      blockStatus = 'FAIL';
      firstFailure ??= { label: row.label, classSize: klass, exitCode, signature: normalize(combined || `exit ${exitCode}`) };
    }
  }
}

const fingerprintMaterial = firstFailure
  ? `${block.id}|${block.domain}|${firstFailure.label}|${firstFailure.classSize ?? 'shared'}|${firstFailure.exitCode ?? 'null'}|${firstFailure.signature}`
  : `${block.id}|${block.domain}|PASS`;
const fingerprint = crypto.createHash('sha256').update(fingerprintMaterial).digest('hex');
const output = {
  schema: 'truyn.d-series.block-result.v1',
  blockId: block.id,
  name: block.name,
  domain: block.domain,
  status: blockStatus,
  sourceSha,
  scale,
  classesTested: selectedClasses,
  startedAt,
  finishedAt: new Date().toISOString(),
  fingerprint,
  firstFailure,
  liveQualification: block.liveQualification || null,
  commands: commandResults
};

fs.writeFileSync(resultPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`TRUYN_D_SERIES_BLOCK block=${block.id} status=${blockStatus} scale=${scale} source_sha=${sourceSha || 'unknown'} fingerprint=${fingerprint}`);
// Deliberately return zero: every matrix block must finish and upload evidence.
// The aggregate job is the only fail-closed verdict for a full blockwise pass.
process.exitCode = 0;
