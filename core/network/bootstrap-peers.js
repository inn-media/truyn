import { parseBootstrapManifest } from './bootstrap-manifest.js';

function normalizedDomain(value) {
  return value.toLowerCase().replace(/\.$/, '');
}

export function independentBootstrapPeers(input, { minimumIndependent = 2 } = {}) {
  const manifest = parseBootstrapManifest(input);
  if (!Number.isSafeInteger(minimumIndependent) || minimumIndependent < 2) {
    throw new Error('minimumIndependent must be an integer >= 2');
  }

  const seenIds = new Set();
  const seenDomains = new Set();
  const peers = [];
  for (const peer of manifest.peers) {
    const domain = normalizedDomain(peer.domain);
    if (seenIds.has(peer.id)) throw new Error(`duplicate bootstrap peer identity: ${peer.id}`);
    if (seenDomains.has(domain)) throw new Error(`duplicate bootstrap peer domain: ${domain}`);
    seenIds.add(peer.id);
    seenDomains.add(domain);
    peers.push(peer);
  }

  if (peers.length < minimumIndependent) {
    throw new Error(`bootstrap manifest requires at least ${minimumIndependent} independently addressable peers`);
  }
  return Object.freeze(peers);
}
