#!/usr/bin/env node
import fs from 'node:fs';

const manifestPath = process.argv[2] || 'config/d500-inheritance.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];

if (manifest.schema !== 'truyn.d500.inheritance.v1') failures.push('schema');
if (manifest.referenceAcceptance?.class !== 'D-200') failures.push('referenceAcceptance.class');
if (manifest.referenceAcceptance?.runId !== '35503894414') failures.push('referenceAcceptance.runId');
if (manifest.referenceAcceptance?.report !== 'docs/benchmarks/CLASS_D_200_2026-09-20.md') failures.push('referenceAcceptance.report');
if (manifest.referenceAcceptance?.terminalMarker !== 'TRUYN_D200_TERMINAL result=PASS') failures.push('referenceAcceptance.terminalMarker');

const required = Object.values(manifest.requiredPaths || {}).flat();
if (!required.length) failures.push('requiredPaths.empty');
for (const path of required) {
  if (!fs.existsSync(path)) failures.push(`missing:${path}`);
}

const unique = new Set(required);
if (unique.size !== required.length) failures.push('requiredPaths.duplicate');

const report = manifest.referenceAcceptance?.report;
if (report && fs.existsSync(report)) {
  const text = fs.readFileSync(report, 'utf8');
  if (!text.includes('35503894414')) failures.push('acceptedReport.runId');
  if (!text.includes('TRUYN_D200_TERMINAL result=PASS')) failures.push('acceptedReport.terminal');
  if (!text.includes('does **not** claim Class D-500')) failures.push('acceptedReport.claimBoundary');
}

const fivePatch = 'docs/operations/class-d/FIVE_PATCH_CANONICAL_CONTRACT.md';
if (fs.existsSync(fivePatch)) {
  const text = fs.readFileSync(fivePatch, 'utf8');
  if (!text.includes('D-500')) failures.push('fivePatch.d500Coverage');
  if (!text.includes('config/class-d-five-patches.json')) failures.push('fivePatch.machineAuthority');
}

if (failures.length) {
  console.error(`TRUYN_D500_INHERITANCE=FAIL ${failures.join(',')}`);
  process.exit(1);
}

console.log(`TRUYN_D500_INHERITANCE=PASS paths=${required.length} accepted_d200_run=35503894414`);
