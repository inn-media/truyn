const CONNECTION_SCOPED_QUIC_ERRORS = new Set([
  'ErrorQUICConnectionInternal',
  'ErrorQUICStreamInternal',
  'ErrorQUICClientInternal'
]);

export function isConnectionScopedQuicError(error) {
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const name = current?.constructor?.name || current?.name;
    if (CONNECTION_SCOPED_QUIC_ERRORS.has(name)) return true;
    current = current.cause;
  }
  return false;
}

function describe(error) {
  if (error instanceof Error) {
    return {
      name: error.constructor?.name || error.name || 'Error',
      code: typeof error.code === 'string' ? error.code : null,
      message: String(error.message || '').slice(0, 300),
      cause: error.cause ? String(error.cause?.message || error.cause).slice(0, 200) : null,
      stack: String(error.stack || '').split('\n').slice(0, 6).join(' | ').slice(0, 900)
    };
  }
  return { name: typeof error, code: null, message: String(error).slice(0, 300), cause: null, stack: null };
}

export function installProcessGuards({
  target = process,
  write = (line) => process.stderr.write(line),
  exit = (code) => process.exit(code),
  fatalExitCode = 70
} = {}) {
  const stats = {
    installedAt: new Date().toISOString(),
    unhandledRejections: 0,
    contained: 0,
    fatal: 0,
    lastContained: null,
    lastUnhandledRejection: null,
    lastFatal: null
  };
  const emit = (marker, payload) => {
    try { write(`${marker} ${JSON.stringify({ at: new Date().toISOString(), pid: target.pid ?? null, ...payload })}\n`); } catch {}
  };
  const contain = (error, source) => {
    stats.contained += 1;
    stats.lastContained = describe(error);
    emit('TRUYN_NODE_CONTAINED_QUIC_ERROR', { source, count: stats.contained, error: stats.lastContained });
  };
  const fatal = (error, source) => {
    stats.fatal += 1;
    stats.lastFatal = describe(error);
    emit('TRUYN_NODE_FATAL', { source, count: stats.fatal, error: stats.lastFatal });
    exit(fatalExitCode);
  };

  target.on('unhandledRejection', (reason) => {
    if (isConnectionScopedQuicError(reason)) { contain(reason, 'unhandledRejection'); return; }
    stats.unhandledRejections += 1;
    stats.lastUnhandledRejection = describe(reason);
    fatal(reason, 'unhandledRejection');
  });

  target.on('uncaughtException', (error) => {
    if (isConnectionScopedQuicError(error)) { contain(error, 'uncaughtException'); return; }
    fatal(error, 'uncaughtException');
  });

  return stats;
}
