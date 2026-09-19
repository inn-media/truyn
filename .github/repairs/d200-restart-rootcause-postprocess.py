from pathlib import Path

path = Path('network/runtime.js')
text = path.read_text()

old_peers = """  #peerRecordPropagationPeers(record = this.localPeerRecord) {\n    if (!record || this.peerRecordPublishFanout <= 0) return [];\n    return this.discovery.closest(record.nodeId, this.peerRecordPublishFanout)\n      .filter((peer) => peer?.nodeId && peer.nodeId !== this.identity.nodeId);\n  }\n"""
new_peers = """  #hydrateControlPlanePeer(peer) {\n    if (!peer?.nodeId) return peer;\n    return this.discovery.get(peer.nodeId) || peer;\n  }\n\n  #peerRecordPropagationPeers(record = this.localPeerRecord) {\n    if (!record || this.peerRecordPublishFanout <= 0) return [];\n    return this.discovery.closest(record.nodeId, this.peerRecordPublishFanout)\n      .map((peer) => this.#hydrateControlPlanePeer(peer))\n      .filter((peer) => peer?.nodeId && peer.nodeId !== this.identity.nodeId);\n  }\n"""
if old_peers not in text:
    raise SystemExit('expected #peerRecordPropagationPeers block not found')
text = text.replace(old_peers, new_peers, 1)

old_source = """    const source = Array.isArray(peers)\n      ? peers.filter((peer) => peer?.nodeId && peer.nodeId !== this.identity.nodeId).sort((a, b) => a.nodeId.localeCompare(b.nodeId))\n      : this.discovery.closest(record.nodeId, fanout);\n"""
new_source = """    const source = (Array.isArray(peers)\n      ? peers.filter((peer) => peer?.nodeId && peer.nodeId !== this.identity.nodeId).sort((a, b) => a.nodeId.localeCompare(b.nodeId))\n      : this.discovery.closest(record.nodeId, fanout))\n      .map((peer) => this.#hydrateControlPlanePeer(peer));\n"""
if old_source not in text:
    raise SystemExit('expected announcePeerRecord source block not found')
text = text.replace(old_source, new_source, 1)

path.write_text(text)
