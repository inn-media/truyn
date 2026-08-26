#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function finiteInteger(value) {
  const parsed = finiteNumber(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseBool(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function parseKeyValues(line) {
  const values = {};
  for (const match of line.matchAll(/([A-Za-z][A-Za-z0-9_]*)=([^\s]+)/g)) {
    values[match[1]] = match[2];
  }
  return values;
}

function compactObject(value) {
  if (Array.isArray(value)) return value.map(compactObject);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined && entry !== null)
        .map(([key, entry]) => [key, compactObject(entry)])
    );
  }
  return value;
}

export function parseClassD1000PartialEvidenceFromLog(logText, { campaignRc = null } = {}) {
  const lines = String(logText || '').split(/\r?\n/);
  let topology = null;
  let cleanup = null;
  let failure = null;
  const convergenceHosts = [];

  for (const line of lines) {
    if (line.includes('TRUYN_CLASS_D_1000 stage=topology')) {
      const values = parseKeyValues(line);
      topology = {
        realProcessCount: finiteInteger(values.nodes),
        nodeCount: finiteInteger(values.nodes),
        uniqueIdentityCount: finiteInteger(values.identities),
        uniqueEndpointCount: finiteInteger(values.sockets),
        syntheticNodeCount: 0,
        hostCount: finiteInteger(values.hosts),
        status: values.status || null
      };
      continue;
    }

    if (line.includes('TRUYN_CLASS_D_1000 stage=convergence host=')) {
      const values = parseKeyValues(line);
      const success = typeof values.success === 'string' ? values.success.match(/^(\d+)\/(\d+)$/) : null;
      if (!success) continue;
      const host = finiteInteger(values.host);
      const successCount = finiteInteger(success[1]);
      const targetCount = finiteInteger(success[2]);
      convergenceHosts.push(compactObject({
        host,
        successCount,
        targetCount,
        successRatio: targetCount ? successCount / targetCount : 0,
        latencyMs: {
          p95: finiteNumber(values.p95Ms),
          p99: finiteNumber(values.p99Ms)
        }
      }));
      continue;
    }

    if (line.includes('TRUYN_CLASS_D_1000_CLEANUP')) {
      const values = parseKeyValues(line);
      const confirmed = parseBool(values.confirmed);
      const remainingResources = finiteInteger(values.remaining);
      cleanup = compactObject({
        confirmed,
        complete: confirmed,
        remainingResources
      });
      continue;
    }

    if (line.includes('TRUYN Class D-1000 failure::')) {
      const values = parseKeyValues(line);
      failure = compactObject({
        stage: values.stage || null,
        exitCode: finiteInteger(values.exit),
        line: finiteInteger(values.line)
      });
    }
  }

  if (!topology && convergenceHosts.length === 0 && !cleanup && !failure) {
    throw new Error('no_class_d_1000_partial_evidence_markers');
  }

  const successCount = convergenceHosts.reduce((total, host) => total + (host.successCount || 0), 0);
  const targetCount = convergenceHosts.reduce((total, host) => total + (host.targetCount || 0), 0);
  const hostP95 = convergenceHosts.map((host) => host.latencyMs?.p95).filter(Number.isFinite);
  const hostP99 = convergenceHosts.map((host) => host.latencyMs?.p99).filter(Number.isFinite);

  return compactObject({
    scope: 'azure-class-d-1000-partial',
    partialEvidence: true,
    acceptanceEligible: false,
    failure: {
      ...(failure || {}),
      campaignRc: finiteInteger(campaignRc)
    },
    topology,
    convergence: {
      hostCount: convergenceHosts.length,
      successCount,
      targetCount,
      successRatio: targetCount ? successCount / targetCount : 0,
      latencyMs: {
        p95: hostP95.length ? Math.max(...hostP95) : null,
        p99: hostP99.length ? Math.max(...hostP99) : null
      },
      hosts: convergenceHosts
    },
    cleanup
  });
}

async function main(argv = process.argv) {
  const [, , logPath, evidencePath = 'class-d-1000-evidence.json', campaignRc = null] = argv;
  if (!logPath) {
    throw new Error('usage: class-d-1000-partial-evidence-from-log.js <log-path> [evidence-path] [campaign-rc]');
  }
  const logText = await readFile(logPath, 'utf8');
  const evidence = parseClassD1000PartialEvidenceFromLog(logText, { campaignRc });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: 'class_d_1000_partial_evidence_generation_failed', message: error.message })}\n`);
    process.exit(1);
  });
}
