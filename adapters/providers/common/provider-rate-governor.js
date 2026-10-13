// Provider capacity governor (S-500 readiness).
//
// Root cause it addresses (S-200 A17 evidence): every one of the 106 HTTP 429
// responses carried a provider Retry-After of 0.09..42 s, yet the caller slept a
// fixed ~60 s before retrying. That alone produced the ~61 s ECON/MIX p95 tail.
//
// The governor is opt-in, process-local and keyed per deployment:
//   * paces requests by RPM/TPM token buckets (when limits are configured);
//   * learns the deployment-global budget from x-ratelimit-remaining-* headers,
//     as advisory feedback. Cross-process coordination requires a shared
//     admission/cooldown coordinator; headers alone cannot reserve its budget;
//   * on 429 honours retry-after-ms / retry-after / x-ratelimit-reset-* exactly
//     (+ small jitter), puts the whole key into cooldown so concurrent callers
//     do not stampede, and retries ONLY 429 (a throttled request was not
//     executed or billed, so the retry is not a duplicate paid execution);
//   * never waits longer than maxWaitMs in total; then it fails fast with a
//     classified `provider_rate_limited` error carrying retryAfterMs, so the
//     relay/requester can route elsewhere instead of hiding a minute of sleep.
//
// It exposes per-call telemetry (attempts, throttle responses, admission wait,
// retry wait) so benchmark evidence can separate provider throttling from
// TRUYN transport overhead instead of silently folding it into provider latency.

const DEFAULTS = Object.freeze({
  rpm: null,
  tpm: null,
  maxRetries: 4,
  maxWaitMs: 45_000,
  minRetryDelayMs: 50,
  fallbackRetryDelayMs: 1_000,
  maxFallbackRetryDelayMs: 20_000,
  jitterRatio: 0.1,
  // Keep this much of the header-reported budget in reserve for other processes.
  headerReserveRatio: 0.05
});

function positiveNumberOrNull(value, name) {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number or null`);
  return value;
}

function nonNegativeInteger(value, name, max) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new Error(`${name} must be an integer 0..${max}`);
  return value;
}

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key ? headers[key] : null;
}

// Parses provider durations: "6", "6.5", "1.2s", "350ms", "1m3s".
function parseDurationMs(raw) {
  if (raw == null) return null;
  const text = String(raw).trim().toLowerCase();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.ceil(Number(text) * 1000);
  let total = 0;
  let matched = false;
  for (const [, amount, unit] of text.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h)/g)) {
    matched = true;
    const n = Number(amount);
    total += unit === 'ms' ? n : unit === 's' ? n * 1000 : unit === 'm' ? n * 60_000 : n * 3_600_000;
  }
  return matched ? Math.ceil(total) : null;
}

export function retryAfterMsFromHeaders(headers, now = Date.now()) {
  const rawMs = headerValue(headers, 'retry-after-ms');
  const ms = rawMs == null || String(rawMs).trim() === '' ? NaN : Number(rawMs);
  if (Number.isFinite(ms) && ms >= 0) return Math.ceil(ms);
  const retryAfter = headerValue(headers, 'retry-after');
  if (retryAfter != null) {
    const seconds = parseDurationMs(retryAfter);
    if (seconds != null) return seconds;
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  const resets = ['x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens']
    .map((name) => parseDurationMs(headerValue(headers, name)))
    .filter((value) => value != null);
  return resets.length ? Math.max(...resets) : null;
}

function sleep(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason || new Error('request_cancelled'));
    const onAbort = () => { clearTimeout(timer); reject(signal.reason || new Error('request_cancelled')); };
    const timer = setTimeout(() => { signal?.removeEventListener?.('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

class Bucket {
  constructor(perMinute, now) {
    this.capacity = perMinute;
    this.ratePerMs = perMinute / 60_000;
    this.tokens = perMinute;
    this.updatedAt = now;
  }
  refill(now) {
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.updatedAt) * this.ratePerMs);
    this.updatedAt = now;
  }
  // Amount above capacity (a single oversized request) is admitted when full.
  waitFor(amount, now) {
    this.refill(now);
    const need = Math.min(amount, this.capacity);
    return this.tokens >= need ? 0 : Math.ceil((need - this.tokens) / this.ratePerMs);
  }
  take(amount, now) {
    this.refill(now);
    this.tokens -= amount;
  }
}

export class ProviderRateLimitedError extends Error {
  constructor({ key, retryAfterMs, attempts, status = 429 }) {
    super(`provider_rate_limited: ${key} retryAfterMs=${retryAfterMs}`);
    this.name = 'ProviderRateLimitedError';
    this.code = 'provider_rate_limited';
    this.truynCode = 'provider_rate_limited';
    this.httpStatus = status;
    this.retryAfterMs = retryAfterMs;
    this.attempts = attempts;
  }
}

export function createProviderRateGovernor(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const now = typeof config.now === 'function' ? config.now : () => Date.now();
  const delay = typeof config.sleep === 'function' ? config.sleep : sleep;
  const random = typeof config.random === 'function' ? config.random : Math.random;
  positiveNumberOrNull(config.rpm, 'rpm');
  positiveNumberOrNull(config.tpm, 'tpm');
  nonNegativeInteger(config.maxRetries, 'maxRetries', 16);
  nonNegativeInteger(config.maxWaitMs, 'maxWaitMs', 600_000);
  if (!(config.jitterRatio >= 0 && config.jitterRatio <= 0.1)) throw new Error('jitterRatio must be 0..0.1');
  if (!(config.headerReserveRatio >= 0 && config.headerReserveRatio < 1)) throw new Error('headerReserveRatio must be 0..1');
  for (const name of ['minRetryDelayMs', 'fallbackRetryDelayMs', 'maxFallbackRetryDelayMs']) nonNegativeInteger(config[name], name, 600_000);
  for (const name of ['admission', 'onThrottle']) if (config[name] != null && typeof config[name] !== 'function') throw new Error(`${name} must be a function`);

  const keys = new Map();
  const totals = { calls: 0, attempts: 0, throttled: 0, rejected: 0, admissionWaitMs: 0, retryWaitMs: 0 };

  function stateFor(key) {
    let state = keys.get(key);
    if (!state) {
      const t = now();
      state = {
        cooldownUntil: 0,
        rpm: config.rpm ? new Bucket(config.rpm, t) : null,
        tpm: config.tpm ? new Bucket(config.tpm, t) : null,
        headerTokens: null, headerRequests: null, headerResetAt: 0
      };
      keys.set(key, state);
    }
    return state;
  }

  function jitter(ms) {
    return Math.ceil(ms * (1 + config.jitterRatio * random()));
  }

  function admissionDelay(state, tokens, t) {
    let wait = Math.max(0, state.cooldownUntil - t);
    if (state.rpm) wait = Math.max(wait, state.rpm.waitFor(1, t));
    if (state.tpm) wait = Math.max(wait, state.tpm.waitFor(tokens, t));
    if (state.headerResetAt > t) {
      const reserveTokens = config.tpm ? config.tpm * config.headerReserveRatio : 0;
      if (state.headerTokens != null && state.headerTokens - reserveTokens < tokens) wait = Math.max(wait, state.headerResetAt - t);
      if (state.headerRequests != null && state.headerRequests < 1) wait = Math.max(wait, state.headerResetAt - t);
    }
    return wait;
  }

  function observeHeaders(state, headers, t) {
    const num = (name) => { const raw = headerValue(headers, name); return raw == null || String(raw).trim() === '' ? NaN : Number(raw); };
    const tokens = num('x-ratelimit-remaining-tokens');
    const requests = num('x-ratelimit-remaining-requests');
    if (!Number.isFinite(tokens) && !Number.isFinite(requests)) return;
    const reset = ['x-ratelimit-reset-tokens', 'x-ratelimit-reset-requests']
      .map((name) => parseDurationMs(headerValue(headers, name)))
      .filter((value) => value != null);
    // Never let an out-of-order response increase a still-active local budget.
    if (Number.isFinite(tokens)) state.headerTokens = state.headerResetAt > t && state.headerTokens != null ? Math.min(state.headerTokens, tokens) : tokens;
    if (Number.isFinite(requests)) state.headerRequests = state.headerResetAt > t && state.headerRequests != null ? Math.min(state.headerRequests, requests) : requests;
    // Azure omits reset headers; its budget is evaluated over short windows.
    state.headerResetAt = t + (reset.length ? Math.max(...reset) : 1_000);
  }

  async function run({ key = 'default', estimatedTokens = 1, signal } = {}, attemptFn) {
    if (typeof attemptFn !== 'function') throw new Error('attemptFn is required');
    const tokens = Math.max(1, Math.ceil(Number(estimatedTokens) || 1));
    const state = stateFor(String(key));
    const telemetry = { key: String(key), attempts: 0, throttled: 0, admissionWaitMs: 0, retryWaitMs: 0, lastRetryAfterMs: null };
    totals.calls++;

    try {
    for (;;) {
      if (signal?.aborted) throw signal.reason || new Error('request_cancelled');
      const wait = admissionDelay(state, tokens, now());
      if (wait > 0) {
        if (telemetry.admissionWaitMs + telemetry.retryWaitMs + wait > config.maxWaitMs) {
          totals.rejected++;
          throw Object.assign(new ProviderRateLimitedError({ key: telemetry.key, retryAfterMs: wait, attempts: telemetry.attempts }), { telemetry });
        }
        const before = now();
        await delay(wait, signal);
        const waited = Math.max(wait, now() - before);
        if (telemetry.attempts === 0) telemetry.admissionWaitMs += waited; else telemetry.retryWaitMs += waited;
        continue;
      }
      if (config.admission) {
        const admissionStarted = now();
        let admitted;
        try { admitted = await config.admission({ key: telemetry.key, estimatedTokens: tokens, signal, waitBudgetMs: Math.max(0, config.maxWaitMs - telemetry.admissionWaitMs - telemetry.retryWaitMs) }); }
        catch (error) { telemetry.admissionWaitMs += Math.max(0, now() - admissionStarted); throw error; }
        const { waitMs = 0 } = admitted;
        if (!Number.isFinite(waitMs) || waitMs < 0) throw new Error('invalid_shared_admission_wait');
        telemetry.admissionWaitMs += waitMs;
        if (telemetry.admissionWaitMs + telemetry.retryWaitMs > config.maxWaitMs) throw new ProviderRateLimitedError({ key: telemetry.key, retryAfterMs: waitMs, attempts: telemetry.attempts });
        if (signal?.aborted) throw signal.reason || new Error('request_cancelled');
      }
      const t = now();
      state.rpm?.take(1, t);
      state.tpm?.take(tokens, t);
      if (state.headerResetAt > t) {
        if (state.headerTokens != null) state.headerTokens -= tokens;
        if (state.headerRequests != null) state.headerRequests -= 1;
      }
      telemetry.attempts++;
      totals.attempts++;
      const response = await attemptFn({ attempt: telemetry.attempts });
      const status = response?.status;
      observeHeaders(state, response?.headers, now());
      if (status !== 429) {
        totals.admissionWaitMs += telemetry.admissionWaitMs;
        totals.retryWaitMs += telemetry.retryWaitMs;
        return { response, telemetry };
      }
      telemetry.throttled++;
      totals.throttled++;
      try { await response.body?.cancel?.(); } catch {}
      const hinted = retryAfterMsFromHeaders(response.headers, now());
      const fallback = Math.min(config.maxFallbackRetryDelayMs, config.fallbackRetryDelayMs * 2 ** (telemetry.throttled - 1));
      const retryAfterMs = jitter(hinted ?? Math.max(config.minRetryDelayMs, fallback));
      telemetry.lastRetryAfterMs = retryAfterMs;
      // Shared cooldown: every in-process caller of this deployment backs off together.
      state.cooldownUntil = Math.max(state.cooldownUntil, now() + retryAfterMs);
      if (config.onThrottle) await config.onThrottle({ key: telemetry.key, retryAfterMs, signal });
      if (telemetry.throttled > config.maxRetries || telemetry.admissionWaitMs + telemetry.retryWaitMs + retryAfterMs > config.maxWaitMs) {
        totals.rejected++;
        totals.admissionWaitMs += telemetry.admissionWaitMs;
        totals.retryWaitMs += telemetry.retryWaitMs;
        throw Object.assign(new ProviderRateLimitedError({ key: telemetry.key, retryAfterMs, attempts: telemetry.attempts }), { telemetry });
      }
    }
    } catch (error) {
      if (error && typeof error === 'object') error.telemetry = { ...telemetry };
      throw error;
    }
  }

  return {
    run,
    cooldownRemainingMs(key = 'default') {
      const state = keys.get(String(key));
      return state ? Math.max(0, state.cooldownUntil - now()) : 0;
    },
    stats() { return { ...totals }; }
  };
}

// Conservative token estimate for admission only (never used for billing).
export function estimateRequestTokens(requestBody, maxOutputTokens = 256) {
  const bytes = typeof requestBody === 'string' ? Buffer.byteLength(requestBody) : 0;
  return Math.ceil(bytes / 4) + Math.max(0, Number(maxOutputTokens) || 0);
}

// Env-driven construction for workers: TRUYN_PROVIDER_GOVERNOR=1 enables it.
export function providerRateGovernorFromEnv(env = process.env) {
  if (!['1', 'true', 'yes', 'on'].includes(String(env.TRUYN_PROVIDER_GOVERNOR || '').toLowerCase())) return null;
  const num = (name) => (env[name] == null || env[name] === '' ? null : Number(env[name]));
  const opts = {};
  if (num('TRUYN_PROVIDER_RPM') != null) opts.rpm = num('TRUYN_PROVIDER_RPM');
  if (num('TRUYN_PROVIDER_TPM') != null) opts.tpm = num('TRUYN_PROVIDER_TPM');
  if (num('TRUYN_PROVIDER_MAX_RETRIES') != null) opts.maxRetries = num('TRUYN_PROVIDER_MAX_RETRIES');
  if (num('TRUYN_PROVIDER_MAX_WAIT_MS') != null) opts.maxWaitMs = num('TRUYN_PROVIDER_MAX_WAIT_MS');
  return createProviderRateGovernor(opts);
}
