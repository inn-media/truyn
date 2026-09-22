#!/usr/bin/env node
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';

const BLOCKS = {
  B01_SOURCE_INTEGRITY: {
    title: 'Source / repository integrity',
    probes: [
      ['git-diff-check', 'git diff --check'],
      ['public-repository-guard', 'node --test tests/public-repository.test.js'],
      ['bootstrap-contract-test', 'node --test tests/class-d-bootstrap-qualification.test.js']
    ]
  },
  B02_BOOTSTRAP_REFRESH: {
    title: 'Bootstrap / DHT refresh correctness',
    probes: [
      ['peer-refresh', 'node --test tests/peer-discovery-refresh.test.js'],
      ['peer-refresh-bounds', 'node --test tests/peer-discovery-refresh-bounds.test.js'],
      ['dht-readiness-endpoint', 'node --test tests/dht-readiness-testnet-endpoint.test.js']
    ]
  },
  B03_RUNTIME_BUNDLE: {
    title: 'Immutable runtime bundle / shell contract',
    probes: [
      ['provision-shell-syntax', 'bash -n benchmarks/scale/class-d-azure-1000-provision.sh'],
      ['runtime-bundle', `set -Eeuo pipefail; d="${'${RUNNER_TEMP:-/tmp}'}/truyn-blockwise-runtime"; rm -rf "$d"; mkdir -p "$d"; b="$d/runtime.tgz"; TRUYN_TESTED_COMMIT="$(git rev-parse HEAD)" scripts/build-class-d-1000-runtime-bundle.sh "$b"; test -s "$b"; sha256sum -c "${'${b}'}.sha256"; x="$d/extract"; mkdir -p "$x"; tar -xzf "$b" -C "$x"; jq -e --arg s "$(git rev-parse HEAD)" '.schema=="truyn.class-d1000.runtime-bundle.v1" and .sourceSha==$s' "$x/manifest.json" >/dev/null`]
    ]
  },
  B04_NETWORK: { title: 'Network suite', probes: [['network-suite', 'npm run test:network']] },
  B05_REGRESSION: { title: 'Regression suite', probes: [['regression-suite', 'npm run test:regression']] },
  B06_SECURITY: { title: 'Security / anti-weakening suite', probes: [['security-suite', 'npm run test:security']] },
  B07_COMPONENT: { title: 'Component suite', probes: [['component-suite', 'npm run test:component']] },
  B08_INTEGRATION: { title: 'Integration / E2E suite', probes: [['integration-suite', 'npm run test:integration']] },
  B09_SDK: { title: 'SDK / conformance suite', probes: [['sdk-suite', 'PYTHONPATH="sdk/python/src${PYTHONPATH:+:$PYTHONPATH}" npm run test:sdk']] },
  B10_FAST_GOVERNANCE: { title: 'Fast governance / hygiene suite', probes: [['fast-suite', 'npm run test:fast']] },
  B11_CLASS_D_ACCEPTANCE: {
    title: 'Class-D/D-200/D-500/D-1000 acceptance contracts',
    probes: [
      ['class-d-tests', `set -Eeuo pipefail; mapfile -t f < <(find tests -maxdepth 1 -type f -name '*.test.js' | grep -E '/([^/]*(d200|d500|d1000)[^/]*|class-d[^/]*)\\.test\\.js$' | sort); test "${'${#f[@]}'}" -gt 0; node --test "${'${f[@]}'}"`]
    ]
  },
  B12_WORKFLOW_CONTRACT: {
    title: 'Workflow / terminal / threshold contract',
    probes: [
      ['bootstrap-workflow', `set -Eeuo pipefail; grep -q 'TRUYN_CLASS_D_BOOTSTRAP_TERMINAL' .github/workflows/class-d-bootstrap-qualification.yml; grep -q 'd500' .github/workflows/class-d-bootstrap-qualification.yml; grep -q 'd1000' .github/workflows/class-d-bootstrap-qualification.yml`],
      ['bootstrap-launcher', `set -Eeuo pipefail; grep -q 'ORGANIZATION_AUTOPILOT_TOKEN_GITHUB' .github/workflows/class-d-bootstrap-launcher.yml; grep -q 'source_sha' .github/workflows/class-d-bootstrap-launcher.yml`],
      ['d500-thresholds', `set -Eeuo pipefail; grep -q 'baselineSuccessRatio>=.99' .github/workflows/d500-acceptance.yml; grep -q 'postRestartSuccessRatio>=.99' .github/workflows/d500-acceptance.yml; grep -q 'healedSuccessRatio>=.99' .github/workflows/d500-acceptance.yml; grep -q 'p95<=120000' .github/workflows/d500-acceptance.yml; grep -q 'acknowledgedWriteCount>=100' .github/workflows/d500-acceptance.yml`]
    ]
  }
};

const blockId = process.env.BLOCK_ID;
if (!BLOCKS[blockId]) throw new Error(`unknown BLOCK_ID=${blockId}`);
const block = BLOCKS[blockId];
const outRoot = process.env.BLOCK_OUT_DIR || 'blockwise-out';
const outDir = path.join(outRoot, blockId);
await fsp.mkdir(outDir, { recursive: true });
const consolePath = path.join(outDir, 'console.log');
const eventPath = path.join(outDir, 'events.jsonl');
const consoleStream = fs.createWriteStream(consolePath, { flags: 'a' });
const eventStream = fs.createWriteStream(eventPath, { flags: 'a' });

const iso = () => new Date().toISOString();
const emit = (event) => eventStream.write(`${JSON.stringify({ ts: iso(), blockId, ...event })}\n`);
const writeConsole = (chunk) => {
  const text = String(chunk);
  process.stdout.write(text);
  consoleStream.write(text);
};
const safeExec = (cmd) => {
  try { return execFileSync('bash', ['-lc', cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (error) { return `[telemetry-error rc=${error.status ?? 'unknown'}] ${String(error.stderr || error.message || '').trim()}`; }
};
const sha256 = async (file) => crypto.createHash('sha256').update(await fsp.readFile(file)).digest('hex');

const sourceSha = safeExec('git rev-parse HEAD');
const metadata = {
  sourceSha,
  blockId,
  title: block.title,
  runId: process.env.GITHUB_RUN_ID || null,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
  job: process.env.GITHUB_JOB || null,
  ref: process.env.GITHUB_REF || null,
  refName: process.env.GITHUB_REF_NAME || null,
  event: process.env.GITHUB_EVENT_NAME || null,
  actor: process.env.GITHUB_ACTOR || null,
  runnerOs: process.env.RUNNER_OS || os.platform(),
  runnerArch: process.env.RUNNER_ARCH || os.arch()
};

const envAllow = /^(CI|GITHUB_(RUN_ID|RUN_ATTEMPT|JOB|REF|REF_NAME|REF_TYPE|SHA|EVENT_NAME|WORKFLOW|WORKFLOW_REF|ACTOR|REPOSITORY)|RUNNER_(OS|ARCH|NAME|ENVIRONMENT|TOOL_CACHE|TEMP)|NODE_OPTIONS)$/;
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => envAllow.test(key)).sort(([a], [b]) => a.localeCompare(b)));
const telemetryCommands = [
  ['uname', 'uname -a'], ['os-release', 'cat /etc/os-release 2>/dev/null || true'], ['node', 'node --version'], ['npm', 'npm --version'],
  ['git', 'git --version'], ['bash', 'bash --version | head -1'], ['jq', 'jq --version'], ['python', 'python3 --version 2>&1'],
  ['memory', 'free -h || true'], ['disk', 'df -h . || true'], ['ulimits', 'ulimit -a || true'], ['commit', 'git rev-parse HEAD'],
  ['branches', 'git branch -vv --no-color || true'], ['remotes', 'git remote -v || true'], ['git-status', 'git status --short --branch || true'],
  ['git-diff-stat', 'git diff --stat || true'], ['git-diff-cached-stat', 'git diff --cached --stat || true']
];
let envText = `# metadata\n${JSON.stringify(metadata, null, 2)}\n\n# selected environment (secrets excluded)\n${JSON.stringify(environment, null, 2)}\n`;
for (const [name, cmd] of telemetryCommands) envText += `\n## ${name}\n$ ${cmd}\n${safeExec(cmd)}\n`;
await fsp.writeFile(path.join(outDir, 'environment.txt'), envText);
emit({ type: 'block.start', metadata, probeCount: block.probes.length });

const assertions = [];
const errorEvents = [];
const startedBlock = Date.now();
for (let index = 0; index < block.probes.length; index += 1) {
  const [name, command] = block.probes[index];
  const probeId = `${blockId}-P${String(index + 1).padStart(2, '0')}`;
  const started = Date.now();
  emit({ type: 'probe.start', probeId, name, command, expected: { exitCode: 0 } });
  writeConsole(`\n===== ${probeId} ${name} =====\n$ ${command}\n`);
  const child = spawn('bash', ['-lc', command], { env: { ...process.env, TRUYN_LOCAL_DEVELOPMENT: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderrTail = [];
  let errorCount = 0;
  const onData = (stream, chunk) => {
    const text = String(chunk);
    writeConsole(text);
    if (stream === 'stderr') stderrTail = [...stderrTail, ...text.split(/\r?\n/).filter(Boolean)].slice(-20);
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      if (/(?:\berror\b|\bfail(?:ed|ure)?\b|exception|timeout|timed out|ERR_|TRUYN_[A-Z0-9_]*FAIL)/i.test(line)) {
        errorCount += 1;
        const evt = { type: 'probe.error', probeId, stream, line: line.slice(0, 4000) };
        errorEvents.push(evt);
        emit(evt);
      }
    }
  };
  child.stdout.on('data', (c) => onData('stdout', c));
  child.stderr.on('data', (c) => onData('stderr', c));
  const result = await new Promise((resolve) => {
    child.on('error', (error) => resolve({ exitCode: 127, signal: null, spawnError: error.message }));
    child.on('close', (code, signal) => resolve({ exitCode: code ?? 1, signal, spawnError: null }));
  });
  const durationMs = Date.now() - started;
  const status = result.exitCode === 0 ? 'GREEN' : 'RED';
  const errorClass = status === 'GREEN' ? null : (result.spawnError ? 'spawn_error' : result.signal ? 'signal_failure' : /timeout|timed out/i.test(stderrTail.join('\n')) ? 'timeout' : 'assertion_or_command_failure');
  const errorMessage = status === 'GREEN' ? null : (result.spawnError || stderrTail.slice(-8).join('\n') || `command exited ${result.exitCode}`);
  const assertion = { probeId, name, command, status, expected: { exitCode: 0 }, observed: { exitCode: result.exitCode, signal: result.signal }, completed: true, durationMs, errorClass, errorMessage, errorEventCount: errorCount };
  assertions.push(assertion);
  emit({ type: 'probe.complete', ...assertion });
  writeConsole(`\n===== ${probeId} status=${status} rc=${result.exitCode} duration_ms=${durationMs} error_events=${errorCount} =====\n`);
}

const redAssertions = assertions.filter((item) => item.status === 'RED');
const status = redAssertions.length ? 'RED' : 'GREEN';
const durationMs = Date.now() - startedBlock;
const blockResult = {
  schema: 'truyn.class-d.blockwise-preflight.block.v1',
  ...metadata,
  status,
  harnessReturnCode: status === 'GREEN' ? 0 : 1,
  startedAt: new Date(startedBlock).toISOString(),
  completedAt: iso(),
  durationMs,
  probeCompletion: { completed: assertions.length, total: block.probes.length, complete: assertions.length === block.probes.length },
  assertions,
  redAssertions,
  errors: redAssertions.map(({ probeId, errorClass, errorMessage, errorEventCount }) => ({ probeId, errorClass, errorMessage, errorEventCount })),
  eventCounts: { probeStarts: assertions.length, probeCompletions: assertions.length, errorEvents: errorEvents.length, totalEvents: (assertions.length * 2) + errorEvents.length + 2 }
};
await fsp.writeFile(path.join(outDir, 'block.json'), `${JSON.stringify(blockResult, null, 2)}\n`);
emit({ type: 'block.complete', status, durationMs, redCount: redAssertions.length, harnessReturnCode: blockResult.harnessReturnCode });
await new Promise((resolve) => eventStream.end(resolve));

let md = `# ${blockId} — ${block.title}\n\n**Status:** ${status}  \n**SHA:** \`${sourceSha}\`  \n**Duration:** ${durationMs} ms  \n**Probe completion:** ${assertions.length}/${block.probes.length}  \n**Error events:** ${errorEvents.length}\n\n## Assertions\n\n| Probe | Status | Expected | Observed | Duration | Errors |\n|---|---|---|---|---:|---:|\n`;
for (const a of assertions) md += `| ${a.probeId} ${a.name} | ${a.status} | rc=0 | rc=${a.observed.exitCode}${a.observed.signal ? ` signal=${a.observed.signal}` : ''} | ${a.durationMs} ms | ${a.errorEventCount} |\n`;
md += `\n## RED assertions\n`;
if (!redAssertions.length) md += `\nNone.\n`;
for (const a of redAssertions) md += `\n### ${a.probeId} — ${a.name}\n- expected: \`exitCode=0\`\n- observed: \`exitCode=${a.observed.exitCode}${a.observed.signal ? ` signal=${a.observed.signal}` : ''}\`\n- error class: \`${a.errorClass}\`\n- error message:\n\n\`\`\`text\n${String(a.errorMessage || '').slice(0, 6000)}\n\`\`\`\n`;
await fsp.writeFile(path.join(outDir, 'report.md'), md);

const checksumTargets = ['console.log', 'environment.txt', 'events.jsonl', 'block.json', 'report.md'];
const checksums = [];
for (const name of checksumTargets) checksums.push(`${await sha256(path.join(outDir, name))}  ${name}`);
await fsp.writeFile(path.join(outDir, 'checksums.sha256'), `${checksums.join('\n')}\n`);
const manifestFiles = [];
for (const name of [...checksumTargets, 'checksums.sha256']) {
  const file = path.join(outDir, name);
  const stat = await fsp.stat(file);
  manifestFiles.push({ name, bytes: stat.size, sha256: await sha256(file) });
}
await fsp.writeFile(path.join(outDir, 'artifact-manifest.json'), `${JSON.stringify({ schema: 'truyn.class-d.blockwise-preflight.manifest.v1', blockId, sourceSha, files: manifestFiles }, null, 2)}\n`);
consoleStream.end();
process.exitCode = status === 'GREEN' ? 0 : 1;
