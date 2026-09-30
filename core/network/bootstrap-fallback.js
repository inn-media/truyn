import { independentBootstrapPeers } from './bootstrap-peers.js';

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedDomain(value) {
  return value.toLowerCase().replace(/\.$/, '');
}

export function orderedBootstrapFallbacks(manifest) {
  const peers = [...independentBootstrapPeers(manifest)];
  peers.sort((left, right) => {
    const domainOrder = compareAscii(normalizedDomain(left.domain), normalizedDomain(right.domain));
    return domainOrder || compareAscii(left.id, right.id);
  });
  return Object.freeze(peers);
}

export async function connectBootstrapFallback({ manifest, connect } = {}) {
  if (typeof connect !== 'function') throw new Error('connect must be a function');
  const peers = orderedBootstrapFallbacks(manifest);
  const failures = [];

  for (const peer of peers) {
    try {
      const connection = await connect(peer);
      if (connection) return Object.freeze({ peer, connection });
      failures.push(`${peer.id}: unavailable`);
    } catch (error) {
      failures.push(`${peer.id}: ${error instanceof Error ? error.message : 'failed'}`);
    }
  }

  throw new Error(`all verified bootstrap entries unavailable: ${failures.join('; ')}`);
}
