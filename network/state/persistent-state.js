import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';

const STATE_VERSION = 1;

export class DurableNetworkState {
  constructor({ filePath } = {}) {
    if (typeof filePath !== 'string' || !filePath.trim()) throw new Error('network state filePath is required');
    this.filePath = filePath;
    this.metrics = {
      saves: 0,
      last: null,
      maxPersistDurationMs: 0,
      maxFsyncDurationMs: 0,
      maxDiskLatencyMs: 0,
      maxSnapshotBytes: 0
    };
  }

  metricsSnapshot() {
    return structuredClone(this.metrics);
  }

  async load() {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (parsed?.version !== STATE_VERSION) throw new Error('unsupported_network_state_version');
      return parsed;
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async save(state) {
    const persistStarted = performance.now();
    const serializeStarted = performance.now();
    const payload = `${JSON.stringify({ version: STATE_VERSION, ...state })}\n`;
    const serializeDurationMs = performance.now() - serializeStarted;
    const snapshotBytes = Buffer.byteLength(payload);
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const temp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    const diskStarted = performance.now();
    const handle = await open(temp, 'w', 0o600);
    let fileFsyncDurationMs = 0;
    let directoryFsyncDurationMs = 0;
    try {
      await handle.writeFile(payload, 'utf8');
      const fileFsyncStarted = performance.now();
      await handle.sync();
      fileFsyncDurationMs = performance.now() - fileFsyncStarted;
    } finally {
      await handle.close();
    }
    await rename(temp, this.filePath);
    try {
      const dirHandle = await open(dir, 'r');
      try {
        const directoryFsyncStarted = performance.now();
        await dirHandle.sync();
        directoryFsyncDurationMs = performance.now() - directoryFsyncStarted;
      } finally {
        await dirHandle.close();
      }
    } catch {
      // Directory fsync is not available on every platform; the atomic file rename is still retained.
    }
    const diskLatencyMs = performance.now() - diskStarted;
    const persistDurationMs = performance.now() - persistStarted;
    const fsyncDurationMs = fileFsyncDurationMs + directoryFsyncDurationMs;
    const last = {
      at: new Date().toISOString(),
      persistDurationMs,
      serializeDurationMs,
      fsyncDurationMs,
      fileFsyncDurationMs,
      directoryFsyncDurationMs,
      diskLatencyMs,
      snapshotBytes
    };
    this.metrics = {
      saves: this.metrics.saves + 1,
      last,
      maxPersistDurationMs: Math.max(this.metrics.maxPersistDurationMs, persistDurationMs),
      maxFsyncDurationMs: Math.max(this.metrics.maxFsyncDurationMs, fsyncDurationMs),
      maxDiskLatencyMs: Math.max(this.metrics.maxDiskLatencyMs, diskLatencyMs),
      maxSnapshotBytes: Math.max(this.metrics.maxSnapshotBytes, snapshotBytes)
    };
    return this.filePath;
  }
}
