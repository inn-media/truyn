#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const RESULT_SCHEMA = 'truyn.d200.stage-runner.result.v1';
const PLAN_SCHEMA = 'truyn.d200.stage-plan.v1';

function now() { return new Date().toISOString(); }
function clip(value, max = 12000) {
  const text = String(value ?? '');
  return text.length <= max ? text : `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function normalize(value) {
  return String(value ?? '').replace(/[0-9a-f]{40,64}/gi, '<hex>').replace(/\b\d{4,}\b/g, '<n>').replace(/\/tmp\/[^\s]+/g, '<tmp>').replace(/\s+/g, ' ').trim().slice(0, 800);
}

export function loadPlan(planPath) {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  if (plan?.schema !== PLAN_SCHEMA || !Array.isArray(plan.stages) || plan.stages.length === 0) throw new Error('invalid D-200 stage plan');
  const ids = new Set();
  for (const stage of plan.stages) {
    if (!stage?.id || ids.has(stage.id)) throw new Error(`invalid or duplicate stage id: ${stage?.id}`);
    ids.add(stage.id);
    if (!Array.isArray(stage.dependsOn)) stage.dependsOn = [];
    if (!stage.command || !Array.isArray(stage.command.argv) || stage.command.argv.length === 0) throw new Error(`stage ${stage.id} has no command`);
    if (!Array.isArray(stage.inputs)) stage.inputs = [];
  }
  for (const stage of plan.stages) for (const dep of stage.dependsOn) if (!ids.has(dep)) throw new Error(`stage ${stage.id} depends on unknown stage ${dep}`);
  const visiting = new Set();
  const visited = new Set();
  const byId = new Map(plan.stages.map((stage) => [stage.id, stage]));
  const visit = (id) => {
    if (visiting.has(id)) throw new Error(`cycle in D-200 stage plan at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of byId.get(id).dependsOn) visit(dep);
    visiting.delete(id); visited.add(id);
  };
  for (const stage of plan.stages) visit(stage.id);
  return plan;
}

function gitHead(cwd) {
  const out = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  return out.status === 0 ? out.stdout.trim() : null;
}
function gitChangedFiles(cwd, fromSha, toSha) {
  const out = spawnSync('git', ['diff', '--name-only', `${fromSha}..${toSha}`], { cwd, encoding: 'utf8' });
  if (out.status !== 0) return null;
  return out.stdout.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
}
function inputMatches(file, input) {
  const token = String(input || '').trim();
  if (!token) return false;
  if (token.endsWith('/**')) return file === token.slice(0, -3) || file.startsWith(token.slice(0, -2));
  if (token.endsWith('/')) return file.startsWith(token);
  if (token.includes('*')) {
    const escaped = token.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
    return new RegExp(`^${escaped}$`).test(file);
  }
  return file === token || file.startsWith(`${token}/`);
}
function descendants(plan, seeds) {
  const out = new Set(seeds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const stage of plan.stages) {
      if (!out.has(stage.id) && stage.dependsOn.some((dep) => out.has(dep))) { out.add(stage.id); changed = true; }
    }
  }
  return out;
}

function atomicWriteJson(file, value) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

async function executeCommand(stage, { cwd, env }) {
  const startedAt = now();
  const [bin, ...args] = stage.command.argv;
  const timeoutMs = Number(stage.command.timeoutMs || 180000);
  return await new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let finished = false;
    const child = spawn(bin, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (chunk) => { stdout += chunk; if (stdout.length > 50000) stdout = stdout.slice(-50000); });
    child.stderr?.on('data', (chunk) => { stderr += chunk; if (stderr.length > 50000) stderr = stderr.slice(-50000); });
    const timer = setTimeout(() => {
      if (finished) return;
      child.kill('SIGTERM');
      setTimeout(() => { if (!finished) child.kill('SIGKILL'); }, 1500).unref();
    }, timeoutMs);
    child.on('error', (error) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      const signature = normalize(error?.stack || error?.message || error);
      resolve({ status: 'INFRA', startedAt, finishedAt: now(), exitCode: null, signal: null, stdout: clip(stdout), stderr: clip(stderr), error: signature, fingerprint: sha256(`${stage.id}|INFRA|${signature}`) });
    });
    child.on('close', (code, signal) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      const timedOut = signal === 'SIGTERM' || signal === 'SIGKILL';
      const status = timedOut ? 'INFRA' : (code === 0 ? 'PASS' : 'FAIL');
      const signature = status === 'PASS' ? 'PASS' : normalize(`${stderr}\n${stdout}\nexit=${code} signal=${signal || ''}`);
      resolve({ status, startedAt, finishedAt: now(), exitCode: typeof code === 'number' ? code : null, signal: signal || null, stdout: clip(stdout), stderr: clip(stderr), error: timedOut ? `timeout after ${timeoutMs}ms` : null, fingerprint: sha256(`${stage.id}|${status}|${signature}`) });
    });
  });
}

function summarize(plan, results) {
  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0, INFRA: 0 };
  for (const stage of plan.stages) counts[results.get(stage.id)?.status || 'INFRA'] += 1;
  return { counts, clean: counts.FAIL === 0 && counts.BLOCKED === 0 && counts.INFRA === 0 };
}

export async function runPlan({
  plan,
  checkpointPath,
  cwd = process.cwd(),
  sourceSha = process.env.TRUYN_D200_SOURCE_SHA || process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA || gitHead(cwd) || 'unknown',
  resume = false,
  resumeAcrossSha = false,
  from = null,
  concurrency = 3,
  extraEnv = {}
}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error('concurrency must be 1..32');
  const planDigest = sha256(JSON.stringify(plan));
  let previous = null;
  if ((resume || from) && fs.existsSync(checkpointPath)) previous = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
  if (from && !previous) throw new Error('--from requires an existing checkpoint');
  if (previous && previous.planDigest !== planDigest) previous = null;

  let changedFiles = [];
  const invalidated = new Set();
  if (from) {
    if (!plan.stages.some((stage) => stage.id === from)) throw new Error(`unknown --from stage: ${from}`);
    for (const id of descendants(plan, new Set([from]))) invalidated.add(id);
  }
  if (previous && previous.sourceSha !== sourceSha) {
    if (!resumeAcrossSha) previous = null;
    else {
      changedFiles = gitChangedFiles(cwd, previous.sourceSha, sourceSha);
      if (!changedFiles) previous = null;
      else {
        const direct = new Set();
        for (const stage of plan.stages) {
          if (stage.inputs.length === 0 || changedFiles.some((file) => stage.inputs.some((input) => inputMatches(file, input)))) direct.add(stage.id);
        }
        for (const id of descendants(plan, direct)) invalidated.add(id);
      }
    }
  }

  const results = new Map();
  const previousById = new Map((previous?.results || []).map((result) => [result.id, result]));
  if (previous) {
    for (const stage of plan.stages) {
      const old = previousById.get(stage.id);
      if (old?.status === 'PASS' && !invalidated.has(stage.id)) results.set(stage.id, { ...old, reused: true, reusedFromSha: previous.sourceSha });
    }
  }

  const startedAt = now();
  const checkpoint = () => {
    const summary = summarize(plan, results);
    atomicWriteJson(checkpointPath, {
      schema: RESULT_SCHEMA,
      sourceSha,
      previousSourceSha: previous?.sourceSha || null,
      planDigest,
      startedAt,
      updatedAt: now(),
      changedFiles,
      invalidatedStages: [...invalidated],
      results: plan.stages.filter((stage) => results.has(stage.id)).map((stage) => results.get(stage.id)),
      summary
    });
    return summary;
  };
  checkpoint();

  const pending = new Set(plan.stages.filter((stage) => !results.has(stage.id)).map((stage) => stage.id));
  const byId = new Map(plan.stages.map((stage) => [stage.id, stage]));
  while (pending.size) {
    const ready = [...pending].map((id) => byId.get(id)).filter((stage) => stage.dependsOn.every((dep) => results.has(dep)));
    if (ready.length === 0) throw new Error(`stage scheduler deadlock: ${[...pending].join(',')}`);

    const runnable = [];
    for (const stage of ready) {
      const failedDeps = stage.dependsOn.filter((dep) => results.get(dep)?.status !== 'PASS');
      if (failedDeps.length) {
        const record = { id: stage.id, status: 'BLOCKED', reused: false, startedAt: now(), finishedAt: now(), blockedBy: failedDeps, fingerprint: sha256(`${stage.id}|BLOCKED|${failedDeps.join(',')}`), command: stage.command.argv };
        results.set(stage.id, record); pending.delete(stage.id); checkpoint();
      } else runnable.push(stage);
    }

    for (let offset = 0; offset < runnable.length; offset += concurrency) {
      const batch = runnable.slice(offset, offset + concurrency);
      const executed = await Promise.all(batch.map(async (stage) => {
        const outcome = await executeCommand(stage, { cwd, env: { TRUYN_D200_STAGE_ID: stage.id, TRUYN_D200_SOURCE_SHA: sourceSha, ...extraEnv } });
        return [stage, outcome];
      }));
      for (const [stage, outcome] of executed) {
        results.set(stage.id, { id: stage.id, reused: false, command: stage.command.argv, ...outcome });
        pending.delete(stage.id);
        checkpoint();
        console.log(`TRUYN_D200_STAGE stage=${stage.id} status=${outcome.status} fingerprint=${outcome.fingerprint}`);
      }
    }
  }
  const summary = checkpoint();
  console.log(`TRUYN_D200_STAGE_RUNNER pass=${summary.counts.PASS} fail=${summary.counts.FAIL} blocked=${summary.counts.BLOCKED} infra=${summary.counts.INFRA} clean=${summary.clean} checkpoint=${checkpointPath}`);
  return { sourceSha, planDigest, results, summary };
}

function parseArgs(argv) {
  const out = { planPath: 'config/d200-stage-plan.json', checkpointPath: 'd200-stage-checkpoint.json', resume: false, resumeAcrossSha: false, from: null, concurrency: 3 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--config') out.planPath = argv[++i];
    else if (arg === '--checkpoint') out.checkpointPath = argv[++i];
    else if (arg === '--resume') out.resume = true;
    else if (arg === '--resume-across-sha') { out.resume = true; out.resumeAcrossSha = true; }
    else if (arg === '--from') { out.resume = true; out.from = argv[++i]; }
    else if (arg === '--concurrency') out.concurrency = Number(argv[++i]);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = loadPlan(args.planPath);
  const result = await runPlan({ plan, checkpointPath: args.checkpointPath, resume: args.resume, resumeAcrossSha: args.resumeAcrossSha, from: args.from, concurrency: args.concurrency });
  if (!result.summary.clean) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error?.stack || error); process.exitCode = 2; });
}
