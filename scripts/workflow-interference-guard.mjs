#!/usr/bin/env node

const ACTIVE_STATUSES = new Set(['queued', 'in_progress', 'pending', 'requested', 'waiting']);

function toSet(value) {
  if (value instanceof Set) return value;
  if (Array.isArray(value)) return new Set(value.map(String));
  if (typeof value === 'string') return new Set(value.split(',').map((item) => item.trim()).filter(Boolean));
  return new Set();
}

function finiteCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function classifyWorkflowRun(run, options = {}) {
  const nowMs = options.now instanceof Date ? options.now.getTime() : Number(options.nowMs ?? Date.now());
  const freshnessMs = Number(options.freshnessMs ?? 6 * 60 * 60 * 1000);
  const currentSha = String(options.currentSha || '');
  const campaignShas = toSet(options.campaignShas);
  if (currentSha) campaignShas.add(currentSha);
  const materialWorkflowPaths = toSet(options.materialWorkflowPaths);
  const materialRunIds = toSet(options.materialRunIds);
  const currentRunId = options.currentRunId == null ? '' : String(options.currentRunId);

  const id = String(run?.id ?? '');
  const status = String(run?.status ?? '');
  const headSha = String(run?.head_sha ?? run?.headSha ?? '');
  const path = String(run?.path ?? '');
  const createdAt = Date.parse(run?.created_at ?? run?.createdAt ?? '');
  const ageMs = Number.isFinite(createdAt) ? Math.max(0, nowMs - createdAt) : Number.POSITIVE_INFINITY;
  const jobsCount = finiteCount(run?.jobs_count ?? run?.jobsCount);
  const artifactsCount = finiteCount(run?.artifacts_count ?? run?.artifactsCount);
  const exactCampaignSha = Boolean(headSha && campaignShas.has(headSha));
  const materialPath = materialWorkflowPaths.has(path);
  const explicitlyMaterialRun = materialRunIds.has(id);
  const materialOverlap = materialPath || explicitlyMaterialRun || run?.shared_resource_overlap === true || run?.sharedResourceOverlap === true;

  const base = {
    id,
    status,
    headSha,
    path,
    ageMs,
    exactCampaignSha,
    materialOverlap,
    jobsCount,
    artifactsCount,
    blocking: false
  };

  if (!ACTIVE_STATUSES.has(status)) return { ...base, classification: 'IGNORED_TERMINAL_OR_INACTIVE' };
  if (currentRunId && id === currentRunId) return { ...base, classification: 'IGNORED_SELF' };
  if (!materialOverlap) return { ...base, classification: 'IGNORED_NO_SHARED_RESOURCE_OVERLAP' };

  const stale = ageMs > freshnessMs;
  const staleDifferentSha = stale && !exactCampaignSha;
  const livenessProvenEmpty = jobsCount === 0 && artifactsCount === 0;

  if (staleDifferentSha && livenessProvenEmpty) {
    return { ...base, classification: 'ORPHANED_STALE', blocking: false };
  }

  if (staleDifferentSha && (jobsCount === null || artifactsCount === null)) {
    return {
      ...base,
      classification: 'STALE_UNVERIFIED_LIVENESS',
      blocking: true,
      reason: 'stale different-SHA run requires jobs/artifacts enrichment before it can be ignored'
    };
  }

  if (staleDifferentSha) {
    return {
      ...base,
      classification: 'ANOMALOUS_NONTERMINAL_WITH_ACTIVITY_OR_EVIDENCE',
      blocking: true
    };
  }

  return {
    ...base,
    classification: exactCampaignSha ? 'ACTIVE_CURRENT_CAMPAIGN_INTERFERENCE' : 'ACTIVE_CROSS_CAMPAIGN_INTERFERENCE',
    blocking: true
  };
}

export function classifyWorkflowRuns(runs, options = {}) {
  const decisions = (runs || []).map((run) => classifyWorkflowRun(run, options));
  return {
    blocking: decisions.some((decision) => decision.blocking),
    decisions
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const name = key.slice(2);
    const value = argv[i + 1];
    if (value == null || value.startsWith('--')) args[name] = true;
    else { args[name] = value; i += 1; }
  }
  return args;
}

async function readStdin() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = parseArgs(process.argv.slice(2));
  const raw = await readStdin();
  const parsed = JSON.parse(raw || '{}');
  const runs = Array.isArray(parsed) ? parsed : parsed.workflow_runs || parsed.runs || [];
  const freshnessMinutes = Number(args['freshness-minutes'] ?? 360);
  const result = classifyWorkflowRuns(runs, {
    currentSha: args['current-sha'] || '',
    campaignShas: args['campaign-shas'] || '',
    materialWorkflowPaths: args['material-workflow-paths'] || '',
    materialRunIds: args['material-run-ids'] || '',
    currentRunId: args['current-run-id'] || '',
    freshnessMs: freshnessMinutes * 60 * 1000,
    nowMs: args['now'] ? Date.parse(args['now']) : Date.now()
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.blocking ? 2 : 0;
}
