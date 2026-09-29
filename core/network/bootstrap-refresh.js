import { enforceBootstrapFreshness } from './bootstrap-freshness.js';
import { independentBootstrapPeers } from './bootstrap-peers.js';

function key(peer) {
  return `${peer.id}\u0000${peer.domain.toLowerCase().replace(/\.$/, '')}`;
}

export function refreshBootstrapPeers({ currentPeers = [], manifest, now = Date.now(), minimumVersion = null, healthy = () => true } = {}) {
  if (!Array.isArray(currentPeers)) throw new Error('currentPeers must be an array');
  if (typeof healthy !== 'function') throw new Error('healthy must be a function');

  const { manifest: freshManifest } = enforceBootstrapFreshness(manifest, { now, minimumVersion });
  const allowed = independentBootstrapPeers(freshManifest);
  const allowedByKey = new Map(allowed.map((peer) => [key(peer), peer]));
  const kept = [];
  const seen = new Set();

  for (const peer of currentPeers) {
    const peerKey = key(peer);
    const replacement = allowedByKey.get(peerKey);
    if (!replacement || !healthy(peer) || seen.has(peerKey)) continue;
    kept.push(replacement);
    seen.add(peerKey);
  }

  for (const peer of allowed) {
    const peerKey = key(peer);
    if (seen.has(peerKey) || !healthy(peer)) continue;
    kept.push(peer);
    seen.add(peerKey);
  }

  if (kept.length < 2) throw new Error('bootstrap refresh produced insufficient healthy allowed peers');
  return Object.freeze({ network: freshManifest.network, manifestVersion: freshManifest.version, peers: Object.freeze(kept) });
}
