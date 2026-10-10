export const F_PHYSICAL_FAULT_CATALOG = Object.freeze({
  packet_loss: { lane: 'F1', proofClass: 'network-impact' },
  latency_spike: { lane: 'F1', proofClass: 'network-impact' },
  packet_reordering: { lane: 'F1', proofClass: 'network-impact' },
  wan_partition: { lane: 'F2', proofClass: 'network-partition-impact' },
  process_termination: { lane: 'F3', proofClass: 'node-liveness-impact' },
  vm_power_loss: { lane: 'F3', proofClass: 'node-liveness-impact' },
  storage_unavailability: { lane: 'F4', proofClass: 'storage-availability-impact' },
  write_failure: { lane: 'F4', proofClass: 'storage-write-impact' },
  capacity_exhaustion: { lane: 'F4', proofClass: 'storage-capacity-impact' },
  compound_faults_under_load: { lane: 'F5', proofClass: 'compound-impact' }
});

export function isDeclaredPhysicalFault(name) {
  return Object.hasOwn(F_PHYSICAL_FAULT_CATALOG, name);
}
