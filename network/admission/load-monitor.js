import { monitorEventLoopDelay } from 'node:perf_hooks';

export class EventLoopLoadMonitor {
  constructor({ sampleIntervalMs = 100, ewmaAlpha = 0.2 } = {}) {
    if (!Number.isInteger(sampleIntervalMs) || sampleIntervalMs < 10) throw new Error('sampleIntervalMs must be >= 10');
    if (!(ewmaAlpha > 0 && ewmaAlpha <= 1)) throw new Error('ewmaAlpha must be in (0, 1]');
    this.sampleIntervalMs = sampleIntervalMs;
    this.ewmaAlpha = ewmaAlpha;
    this.lagEwmaMs = 0;
    this.lastLagMs = 0;
    this.maxLagMs = 0;
    this.timer = null;
    this.expectedAt = 0;
    this.histogram = null;
  }

  start() {
    if (this.timer) return this;
    try {
      this.histogram = monitorEventLoopDelay({ resolution: 20 });
      this.histogram.enable();
    } catch {
      this.histogram = null;
    }
    this.expectedAt = Date.now() + this.sampleIntervalMs;
    this.timer = setInterval(() => {
      const now = Date.now();
      const lag = Math.max(0, now - this.expectedAt);
      this.expectedAt = now + this.sampleIntervalMs;
      this.lastLagMs = lag;
      if (lag > this.maxLagMs) this.maxLagMs = lag;
      this.lagEwmaMs = this.lagEwmaMs + this.ewmaAlpha * (lag - this.lagEwmaMs);
    }, this.sampleIntervalMs);
    this.timer.unref?.();
    return this;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try { this.histogram?.disable(); } catch {}
  }

  lagMs() {
    return Math.max(this.lagEwmaMs, this.lastLagMs * 0.5);
  }

  overloaded(thresholdMs) {
    return this.timer != null && this.lagMs() >= thresholdMs;
  }

  snapshot() {
    const histogram = this.histogram;
    const ms = (value) => (Number.isFinite(value) ? Math.round(value / 1e4) / 100 : null);
    return {
      lagEwmaMs: Math.round(this.lagEwmaMs * 100) / 100,
      lastLagMs: this.lastLagMs,
      maxLagMs: this.maxLagMs,
      delayP50Ms: histogram ? ms(histogram.percentile(50)) : null,
      delayP99Ms: histogram ? ms(histogram.percentile(99)) : null,
      delayMaxMs: histogram ? ms(histogram.max) : null
    };
  }
}

let sharedMonitor = null;
export function sharedEventLoopMonitor() {
  if (!sharedMonitor) sharedMonitor = new EventLoopLoadMonitor().start();
  return sharedMonitor;
}
