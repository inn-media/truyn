#!/usr/bin/env node
import fs from 'node:fs';
const staging = fs.readFileSync('scripts/d200-stage-runtime-bundle.sh', 'utf8');
const provision = fs.readFileSync('benchmarks/scale/class-d-azure-1000-provision.sh', 'utf8');
const campaign = fs.readFileSync('benchmarks/scale/class-d-azure-1000-campaign.sh', 'utf8');
const orchestrator = fs.readFileSync('scripts/d200-stage-isolated-campaign.sh', 'utf8');
const restart = fs.readFileSync('benchmarks/scale/d200-restart-recovery-stage.sh', 'utf8');
const required = [
  ['private staging account', staging.includes('--allow-blob-public-access false')],
  ['OIDC data-plane marker', staging.includes('auth=oidc_data_plane')],
  ['container auth-mode login', /storage container create[^\n]*--auth-mode login/.test(staging)],
  ['blob upload auth-mode login', /storage blob upload[^\n]*--auth-mode login/.test(staging)],
  ['user delegation SAS', /generate-sas[^\n]*--auth-mode login[^\n]*--as-user/.test(staging)],
  ['canonical provision script', provision.includes('TRUYN_D200_FAILURE_EVIDENCE=RETAINED')],
  ['canonical campaign readiness evidence', campaign.includes('class-d-200-readiness-node-observations.json')],
  ['stage-isolated orchestration', orchestrator.includes('TRUYN_D200_STAGE_RESULT') && orchestrator.includes('SKIPPED_DEPENDENCY')],
  ['stage results evidence', orchestrator.includes('class-d-200-stage-results.json') && orchestrator.includes('acceptanceWeakened')],
  ['restart diagnostic override', orchestrator.includes('d200-restart-recovery-stage.sh')],
  ['restart per-host evidence', restart.includes('class-d-200-restart-recovery-hosts.json') && restart.includes('TRUYN_D200_RESTART_HOST_FAILURE')],
  ['restart exact READY contract', restart.includes('[[ "$(marker "$out" READY)" == "$NODES_PER_HOST" ]]')],
  ['restart logical failure does not replay remote restart', restart.includes('RESTART_LOGICAL_RC=') && restart.includes('exit 0\nEOS')]
];
const forbidden = [
  ['account key flag', /--account-key\b/.test(staging)],
  ['storage key env', /AZURE_STORAGE_(?:KEY|CONNECTION_STRING)/.test(staging)],
  ['public container flag', /--public-access\s+(?!off\b|false\b)/.test(staging)],
  ['stage isolation weakens terminal acceptance', /acceptanceWeakened['\"]?\s*[:=]\s*true/.test(orchestrator)]
];
const failures = [...required.filter(([, ok]) => !ok).map(([name]) => `missing:${name}`), ...forbidden.filter(([, found]) => found).map(([name]) => `forbidden:${name}`)];
if (failures.length) {
  console.error(`TRUYN_D200_CLOUD_CONTRACT=FAIL ${failures.join(',')}`);
  process.exitCode = 1;
} else {
  console.log('TRUYN_D200_CLOUD_CONTRACT=PASS private=true auth=oidc_entra fail_closed=true stage_isolation=true');
}
