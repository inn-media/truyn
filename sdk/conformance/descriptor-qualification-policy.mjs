/** Repository-source qualification, not arbitrary toolchain/dependency hermeticity. */
export function conformanceEnvironment(input = process.env) {
  const env = { ...input };
  for (const key of Object.keys(env)) {
    if (/^GOFLAGS$/i.test(key) && String(env[key] ?? '').trim() !== '') {
      throw new Error('Descriptor qualification requires empty GOFLAGS; source overlays and injected build flags are not permitted');
    }
    if (/^(?:GOFLAGS|GOENV|GOWORK)$/i.test(key)) delete env[key];
  }
  // Disable persisted go env flags and ancestor/external workspace replacement.
  // Explicit command arguments only; no environment source overlays.
  return { ...env, GOFLAGS: '', GOENV: 'off', GOWORK: 'off' };
}
export function assertExactDescriptorQualification(report) {
  if (report?.passed !== true || report?.workingTreeClean !== true || report?.exactSourceQualified !== true ||
      report?.sourceBefore?.clean !== true || report?.sourceAfter?.clean !== true ||
      !/^[a-f0-9]{40}$/.test(report?.sourceSha ?? '') ||
      report.sourceSha !== report.sourceShaAfter || report.sourceSha !== report.sourceBefore.sourceSha ||
      report.sourceSha !== report.sourceAfter.sourceSha) {
    throw new Error('five-SDK Descriptor exact-source qualification failed (functional PASS alone is not acceptance)');
  }
  return report;
}
