import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function sleepSync(ms) {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(signal, 0, 0, Math.max(1, Math.floor(ms)));
}

function durableStateError(code, cause = null) {
  const error = new Error(code);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'EPERM') return true;
    if (error?.code === 'ESRCH') return false;
    return true;
  }
}

export function createDurableJsonStore({
  filePath,
  defaultState = { version: 1, revision: 0 },
  lockTimeoutMs = 5_000,
  staleLockMs = 30_000,
  nowMs = () => Date.now()
} = {}) {
  if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('durable store filePath is required');
  if (!Number.isFinite(lockTimeoutMs) || lockTimeoutMs < 1) throw new Error('lockTimeoutMs must be positive');
  if (!Number.isFinite(staleLockMs) || staleLockMs < lockTimeoutMs) throw new Error('staleLockMs must be >= lockTimeoutMs');

  const path = resolve(filePath);
  const directory = dirname(path);
  const lockPath = `${path}.lock`;
  mkdirSync(directory, { recursive: true, mode: 0o700 });

  function readUnlocked() {
    if (!existsSync(path)) return clone(defaultState);
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      throw durableStateError('durable_state_corrupt', error);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw durableStateError('durable_state_corrupt');
    }
    return parsed;
  }

  function readLockRecord() {
    try {
      const parsed = JSON.parse(readFileSync(lockPath, 'utf8'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      return null;
    }
  }

  function acquireLock() {
    const startedAt = nowMs();
    const owner = randomBytes(16).toString('hex');
    for (;;) {
      try {
        const fd = openSync(lockPath, 'wx', 0o600);
        writeFileSync(fd, JSON.stringify({ pid: process.pid, owner, acquiredAt: new Date(nowMs()).toISOString() }));
        fsyncSync(fd);
        closeSync(fd);
        return owner;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw durableStateError('durable_lock_unavailable', error);
        try {
          const ageMs = nowMs() - statSync(lockPath).mtimeMs;
          if (ageMs >= staleLockMs) {
            const record = readLockRecord();
            if (!record || !processAlive(Number(record.pid))) {
              unlinkSync(lockPath);
              continue;
            }
          }
        } catch (statError) {
          if (statError?.code === 'ENOENT') continue;
          throw durableStateError('durable_lock_unavailable', statError);
        }
        if (nowMs() - startedAt >= lockTimeoutMs) throw durableStateError('durable_lock_timeout');
        sleepSync(10);
      }
    }
  }

  function releaseLock(owner) {
    try {
      const record = readLockRecord();
      if (!record || record.owner !== owner) return;
      unlinkSync(lockPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  function persistUnlocked(state) {
    const suffix = randomBytes(8).toString('hex');
    const temporary = `${path}.tmp-${process.pid}-${suffix}`;
    let fd = null;
    try {
      fd = openSync(temporary, 'wx', 0o600);
      writeFileSync(fd, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      fsyncSync(fd);
      closeSync(fd);
      fd = null;
      renameSync(temporary, path);
      const dirFd = openSync(directory, 'r');
      try {
        fsyncSync(dirFd);
      } finally {
        closeSync(dirFd);
      }
    } catch (error) {
      if (fd != null) {
        try { closeSync(fd); } catch {}
      }
      try { if (existsSync(temporary)) unlinkSync(temporary); } catch {}
      throw durableStateError('durable_write_failed', error);
    }
  }

  function read() {
    return clone(readUnlocked());
  }

  function transaction(mutator) {
    if (typeof mutator !== 'function') throw new Error('transaction mutator is required');
    const owner = acquireLock();
    try {
      const current = readUnlocked();
      const draft = clone(current);
      const result = mutator(draft);
      const currentRevision = Number.isSafeInteger(current.revision) && current.revision >= 0 ? current.revision : 0;
      draft.revision = currentRevision + 1;
      draft.updatedAt = new Date(nowMs()).toISOString();
      persistUnlocked(draft);
      return { result: clone(result), state: clone(draft) };
    } finally {
      releaseLock(owner);
    }
  }

  return Object.freeze({
    durable: true,
    filePath: path,
    read,
    transaction
  });
}
