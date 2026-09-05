function writeJson(res, status, body) {
  if (res.writableEnded) return;
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(data);
}

function safeStatus(statusProvider) {
  try {
    const status = statusProvider();
    if (!status || typeof status !== 'object') return { ready: false, reason: 'managed_authority_status_invalid' };
    return status;
  } catch {
    return { ready: false, reason: 'managed_authority_status_unavailable' };
  }
}

export function installRelayAuthorityReadiness(server, {
  statusProvider,
  onReadyChange = null,
  pollMs = 250
} = {}) {
  if (!server || typeof server.listeners !== 'function') throw new Error('relay readiness requires http server');
  if (typeof statusProvider !== 'function') throw new Error('relay readiness requires statusProvider');
  if (!Number.isSafeInteger(pollMs) || pollMs < 100 || pollMs > 60_000) throw new Error('relay readiness pollMs must be 100..60000');

  const requestListeners = server.listeners('request');
  if (requestListeners.length === 0) throw new Error('relay readiness requires existing request handler');
  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://relay.local'); } catch { url = null; }
    if (req.method === 'GET' && url?.pathname === '/ready') {
      const status = safeStatus(statusProvider);
      return writeJson(res, status.ready === true ? 200 : 503, {
        ok: status.ready === true,
        authorityRevision: status.revision ?? null,
        authoritySnapshotAgeMs: status.snapshotAgeMs ?? null
      });
    }
    for (const listener of requestListeners) listener.call(server, req, res);
  });

  let lastReady = null;
  function publish() {
    const ready = safeStatus(statusProvider).ready === true;
    if (ready !== lastReady) {
      lastReady = ready;
      if (typeof onReadyChange === 'function') onReadyChange(ready);
    }
    return ready;
  }
  publish();
  const timer = setInterval(publish, pollMs);
  timer.unref?.();

  return Object.freeze({
    status: () => safeStatus(statusProvider),
    stop() { clearInterval(timer); },
    publish
  });
}
