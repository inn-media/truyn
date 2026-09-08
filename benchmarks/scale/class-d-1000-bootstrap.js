import { createHash } from 'node:crypto';
import { dhtId } from '../../network/dht/kademlia.js';

function bitIndex(distance) {
  if (distance === 0n) return -1;
  return distance.toString(2).length - 1;
}

function deterministicScore(seed, localNodeId, peerNodeId) {
  return createHash('sha256').update(`${seed}:${localNodeId}:${peerNodeId}`).digest('hex');
}

export function peerFailureDomain(record) {
  for (const endpoint of record?.endpoints || []) {
    if (typeof endpoint !== 'string' || !endpoint.trim()) continue;
    try {
      const host = new URL(endpoint).hostname;
      if (host) return host.toLowerCase();
    } catch {
      const match = endpoint.match(/^[a-z][a-z0-9+.-]*:\/\/(\[[^\]]+\]|[^:/?#]+)/i);
      if (match?.[1]) return match[1].toLowerCase();
    }
  }
  return null;
}

export function buildClassD1000BootstrapPlan(records, {
  seed = 'truyn-class-d-1000',
  maxPeersPerNode = 32,
  peersPerBucket = 2,
  requiredFailureDomains = null
} = {}) {
  if (!Array.isArray(records) || records.length < 2) throw new Error('at least two peer records are required');
  if (!Number.isInteger(maxPeersPerNode) || maxPeersPerNode < 1) throw new Error('maxPeersPerNode must be >= 1');
  if (!Number.isInteger(peersPerBucket) || peersPerBucket < 1) throw new Error('peersPerBucket must be >= 1');
  if (requiredFailureDomains != null && (!Number.isInteger(requiredFailureDomains) || requiredFailureDomains < 1)) {
    throw new Error('requiredFailureDomains must be a positive integer');
  }
  if (requiredFailureDomains != null && requiredFailureDomains > maxPeersPerNode) {
    throw new Error('requiredFailureDomains cannot exceed maxPeersPerNode');
  }

  const unique = new Set();
  const dhtIds = new Map();
  const failureDomains = new Map();
  for (const record of records) {
    if (!record?.nodeId) throw new Error('every record requires nodeId');
    if (unique.has(record.nodeId)) throw new Error(`duplicate nodeId: ${record.nodeId}`);
    unique.add(record.nodeId);
    dhtIds.set(record.nodeId, BigInt(`0x${dhtId(record.nodeId)}`));
    failureDomains.set(record.nodeId, peerFailureDomain(record));
  }

  if (requiredFailureDomains != null) {
    const missingDomain = records.find((record) => !failureDomains.get(record.nodeId));
    if (missingDomain) throw new Error(`failure domain unavailable for ${missingDomain.nodeId}`);
    const availableDomains = new Set(failureDomains.values());
    if (availableDomains.size !== requiredFailureDomains) {
      throw new Error(`failure domain count mismatch: expected ${requiredFailureDomains}, got ${availableDomains.size}`);
    }
  }

  const plan = new Map();
  for (const local of records) {
    const localDhtId = dhtIds.get(local.nodeId);
    const buckets = new Map();
    for (const peer of records) {
      if (peer.nodeId === local.nodeId) continue;
      const bucket = bitIndex(localDhtId ^ dhtIds.get(peer.nodeId));
      const items = buckets.get(bucket) || [];
      items.push({
        peer,
        bucketScore: deterministicScore(seed, local.nodeId, peer.nodeId),
        fillScore: deterministicScore(`${seed}:fill`, local.nodeId, peer.nodeId)
      });
      buckets.set(bucket, items);
    }

    const selected = [];
    const selectedIds = new Set();

    if (requiredFailureDomains != null) {
      const domains = [...new Set(failureDomains.values())].sort();
      for (const domain of domains) {
        const candidates = records
          .filter((peer) => peer.nodeId !== local.nodeId && failureDomains.get(peer.nodeId) === domain)
          .map((peer) => ({
            peer,
            score: deterministicScore(`${seed}:failure-domain:${domain}`, local.nodeId, peer.nodeId)
          }))
          .sort((a, b) => a.score.localeCompare(b.score));
        const anchor = candidates[0]?.peer;
        if (!anchor) throw new Error(`no bootstrap peer available for failure domain ${domain} from ${local.nodeId}`);
        selected.push(anchor);
        selectedIds.add(anchor.nodeId);
      }
    }

    for (const bucket of [...buckets.keys()].sort((a, b) => a - b)) {
      const candidates = buckets.get(bucket).slice().sort((a, b) => a.bucketScore.localeCompare(b.bucketScore));
      let admitted = 0;
      for (const candidate of candidates) {
        if (selected.length >= maxPeersPerNode || admitted >= peersPerBucket) break;
        if (selectedIds.has(candidate.peer.nodeId)) continue;
        selected.push(candidate.peer);
        selectedIds.add(candidate.peer.nodeId);
        admitted += 1;
      }
      if (selected.length >= maxPeersPerNode) break;
    }

    if (selected.length < maxPeersPerNode) {
      const remaining = [];
      for (const items of buckets.values()) {
        for (const candidate of items) {
          if (!selectedIds.has(candidate.peer.nodeId)) remaining.push(candidate);
        }
      }
      remaining.sort((a, b) => a.fillScore.localeCompare(b.fillScore));
      for (const candidate of remaining) {
        if (selected.length >= maxPeersPerNode) break;
        selected.push(candidate.peer);
        selectedIds.add(candidate.peer.nodeId);
      }
    }

    if (requiredFailureDomains != null) {
      const selectedDomains = new Set(selected.map((peer) => failureDomains.get(peer.nodeId)).filter(Boolean));
      if (selectedDomains.size !== requiredFailureDomains) {
        throw new Error(`bootstrap failure-domain coverage mismatch for ${local.nodeId}`);
      }
    }
    plan.set(local.nodeId, selected);
  }
  return plan;
}

export function summarizeClassD1000BootstrapPlan(plan) {
  const peerSets = [...plan.values()];
  const sizes = peerSets.map((peers) => peers.length);
  const failureDomainCounts = peerSets.map((peers) => new Set(peers.map((peer) => peerFailureDomain(peer)).filter(Boolean)).size);
  return {
    nodeCount: plan.size,
    minPeers: sizes.length ? Math.min(...sizes) : 0,
    maxPeers: sizes.length ? Math.max(...sizes) : 0,
    meanPeers: sizes.length ? sizes.reduce((sum, value) => sum + value, 0) / sizes.length : 0,
    minFailureDomains: failureDomainCounts.length ? Math.min(...failureDomainCounts) : 0,
    maxFailureDomains: failureDomainCounts.length ? Math.max(...failureDomainCounts) : 0,
    allToAll: sizes.length > 0 && sizes.every((size) => size === plan.size - 1)
  };
}
