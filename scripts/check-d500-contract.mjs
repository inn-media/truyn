#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SAFETY_FLOOR as D200_FLOOR } from './check-d200-contract.mjs';

export const D500_TOPOLOGY = Object.freeze({
  hostsRequired: 20,
  processTarget: 500,
  nodesPerHost: 25,
  restartNodesPerHostRequired: 5,
  restartNodeTarget: 100,
});

export function validate(c) {
  const errors = [];
  if (c.schema !== 'truyn.d500.contract.v1') errors.push('schema');

  for (const [key, expected] of Object.entries(D500_TOPOLOGY)) {
    if (c[key] !== expected) errors.push(key);
  }
  if (c.processTarget !== c.hostsRequired * c.nodesPerHost) errors.push('topologyProduct');
  if (c.restartNodeTarget !== c.hostsRequired * c.restartNodesPerHostRequired) errors.push('restartTopologyProduct');

  for (const key of [
    'acknowledgedWritesRequired',
    'peerRecordTtlMs',
    'bootstrapMinPeerLeaseRemainingMs',
  ]) {
    if (c[key] < D200_FLOOR[key]) errors.push(`${key}:weaker-than-d200`);
  }

  for (const key of [
    'maxPeers',
    'convergenceMaximumMs',
    'recoveryMaximumMs',
    'acknowledgedWriteLossAllowed',
    'safetyViolationsAllowed',
    'cleanupRemainingAllowed',
    'stagingCleanupRemainingAllowed',
  ]) {
    if (c[key] > D200_FLOOR[key]) errors.push(`${key}:weaker-than-d200`);
  }

  if (c.routingAcceptanceMinimum < D200_FLOOR.routingAcceptanceMinimum) errors.push('routingAcceptanceMinimum:weaker-than-d200');
  if (c.allToAllForbidden !== true) errors.push('allToAllForbidden');
  if (c.fivePatchCanonicalRequired !== true) errors.push('fivePatchCanonicalRequired');
  if (c.immutableRuntimeBundleRequired !== true) errors.push('immutableRuntimeBundleRequired');
  if (c.exactShaQualificationRequired !== true) errors.push('exactShaQualificationRequired');
  if (c.stageIsolatedDiagnosticsRequired !== true) errors.push('stageIsolatedDiagnosticsRequired');
  if (c.publicEvidencePolicy !== 'verify-max-exposure-min-redact-not-delete') errors.push('publicEvidencePolicy');

  if (errors.length) {
    throw new Error(`D-500 contract violation: ${[...new Set(errors)].join(',')}`);
  }
  return true;
}

export function main(argv = process.argv.slice(2)) {
  const path = argv[0] || 'config/d500-contract.json';
  validate(JSON.parse(fs.readFileSync(path, 'utf8')));
  console.log('TRUYN_D500_CONTRACT=PASS');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
