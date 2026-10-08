#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateAzureClassD5000Evidence } from './class-d-5000-evidence.js';

const evidencePath = resolve(process.argv[2] || 'class-d-5000-evidence.json');
let raw;
try {
  raw = JSON.parse(await readFile(evidencePath, 'utf8'));
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: 'class_d_5000_terminal_evidence_unreadable', message: error.message })}\n`);
  process.exit(2);
}

const evaluation = evaluateAzureClassD5000Evidence(raw);
const n = evaluation.normalized || {};
const checks = {
  canonicalEvaluator: evaluation.passed === true && evaluation.failed.length === 0,
  readinessAll5000: n.readiness?.readyNodeCount === 5000,
  readinessRatioFull: n.readiness?.readyNodeRatio === 1,
  allMandatoryStagesPass: n.stageResults?.complete === true,
  d5000SourceContract: n.sourceContract?.valid === true,
  realNodes: n.topology?.realNodeCount === 5000,
  strictNodesPerHost: n.topology?.realProcessesPerHost === 250,
  distinctIdentities: n.topology?.distinctIdentityCount === 5000,
  distinctQuicSockets: n.topology?.distinctQuicSocketCount === 5000,
  noSyntheticNodes: n.topology?.syntheticNodeCount === 0,
  hostFailureDomains: Number(n.topology?.hostCount) >= 20,
  baselineRouting: Number(n.routing?.baselineSuccessRatio) >= 0.99,
  healedRouting: Number(n.routing?.healedSuccessRatio) >= 0.99,
  convergenceP95: Number(n.convergence?.latencyMs?.p95) <= 120000,
  recoveryP95: Number(n.recovery?.latencyMs?.p95) <= 120000,
  noAcknowledgedWriteLoss: n.safety?.acknowledgedWriteLossCount === 0,
  noInvalidSignedStateAccepted: n.safety?.invalidSignedStateAcceptedCount === 0,
  noStaleRevokedReceiptAccepted: n.safety?.staleRevokedReceiptAcceptedCount === 0,
  noUnauthorizedProviderExecution: n.safety?.unauthorizedProviderExecutionCount === 0,
  remoteInvalidSignatureProbe: evaluation.derivation?.invalidSignedStateProbe === true,
  staleReceiptProbe: evaluation.derivation?.staleReceiptProbe === true,
  providerAuthorizationProbe: evaluation.derivation?.providerAuthorizationProbe === true,
  realPacketPartitionProbe: evaluation.derivation?.packetPartitionProbe === true,
  cleanupConfirmed: n.cleanup?.complete === true,
  zeroRemainingResources: n.cleanup?.remainingResources === 0 && raw?.cleanup?.remainingResources === 0
};
const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
const result = {
  ok: failed.length === 0,
  class: 'D-5000',
  failed,
  checks,
  testedCommit: raw?.testedCommit || null,
  workflowRunId: raw?.workflowRunId || null,
  derivation: evaluation.derivation,
  normalized: n
};
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(result.ok ? 0 : 1);
