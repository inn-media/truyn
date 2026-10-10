const PHYSICAL_MECHANISMS = new Set([
  'kernel_tc_netem',
  'kernel_nft',
  'azure_nsg',
  'azure_udr',
  'azure_vm_poweroff',
  'azure_disk_detach',
  'dmsetup_error',
  'dmsetup_flakey',
  'filesystem_enospc'
]);

const FORBIDDEN_EVIDENCE = [
  /NetworkFaultController/i,
  /TRUYN_FAULT_/i,
  /mock/i,
  /simulat/i,
  /replay/i
];

export function validateImpactProofEpisode(episode) {
  const errors = [];
  if (!episode || typeof episode !== 'object') return { ok: false, errors: ['episode required'] };
  if (!episode.episodeId) errors.push('episodeId required');
  if (!PHYSICAL_MECHANISMS.has(episode.mechanism)) errors.push('mechanism is not an approved physical mechanism');
  if (episode.simulated === true) errors.push('simulated episode is forbidden');
  const serialized = JSON.stringify(episode);
  for (const pattern of FORBIDDEN_EVIDENCE) if (pattern.test(serialized)) errors.push(`forbidden simulation marker: ${pattern}`);

  const proofs = Array.isArray(episode.impactProofs) ? episode.impactProofs : [];
  const independent = new Set(proofs.map((p) => p?.source).filter(Boolean));
  if (independent.size < 2) errors.push('at least two independent impact proof sources required');

  if (episode.mechanism.startsWith('azure_') && !episode.azureActivityLogRef) {
    errors.push('Azure mutation requires Azure Activity Log evidence');
  }
  if (!episode.preStateDigest || !episode.duringStateDigest || !episode.postHealStateDigest) {
    errors.push('pre/during/post-heal state digests required');
  }
  return { ok: errors.length === 0, errors };
}

export { PHYSICAL_MECHANISMS };
